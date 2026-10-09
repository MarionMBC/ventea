import { STATUS_CODES } from 'node:http';

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { planLimitSchema, type ApiErrorCode, type PlanLimit } from '@ventea/shared';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  issues?: unknown[];
  /** Código estable para que el cliente traduzca (hoy `plan_limit`), con su detalle. */
  code?: ApiErrorCode;
  limit?: PlanLimit;
}

/**
 * Formato único de error: `{statusCode, message, error}` (+ `issues` en los 400 de
 * validación, y `code` + `limit` en los límites de plan). Las apps cliente parsean un solo shape.
 *
 * Lo que no es HttpException es un bug o una caída de infraestructura: se registra
 * completo en el log y al cliente le llega un 500 genérico, sin stack ni SQL.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();
      const body: ErrorBody = {
        statusCode,
        message: exception.message,
        error: errorName(statusCode),
      };

      if (typeof raw === 'string') {
        body.message = raw;
      } else if (raw && typeof raw === 'object') {
        const fields = raw as Record<string, unknown>;
        if (typeof fields.message === 'string' || Array.isArray(fields.message)) {
          body.message = fields.message as string | string[];
        }
        if (Array.isArray(fields.issues)) body.issues = fields.issues;
        // Solo códigos conocidos con su detalle válido: nada arbitrario llega al cliente.
        const limit = planLimitSchema.safeParse(fields.limit);
        if (fields.code === 'plan_limit' && limit.success) {
          body.code = 'plan_limit';
          body.limit = limit.data;
        }
      }
      return body;
    }

    // Errores de Express previos al controlador (JSON mal formado, body demasiado grande).
    const status = (exception as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return { statusCode: status, message: 'Petición inválida', error: errorName(status) };
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno',
      error: errorName(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }
}

function errorName(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}
