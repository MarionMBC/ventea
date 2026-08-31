import { BadRequestException, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida el body contra un schema de `@ventea/shared`.
 *
 * Se escribe acá en vez de usar una librería puente porque son veinte líneas y
 * evita atar la versión de NestJS a la de un paquete de terceros.
 *
 * Uso:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderInput) {}
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Se devuelven los errores por campo: un 400 sin detalle obliga a adivinar
      // qué venía mal desde el cliente.
      throw new BadRequestException({
        message: 'Datos inválidos',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
