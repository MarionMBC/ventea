import {
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { SlidingWindowLimiter } from './rate-limit';

const RATE_LIMIT_KEY = 'ventea:rate-limit';
const HOUR_MS = 60 * 60 * 1000;

export interface RateLimitOptions {
  /** Contador independiente por ruta: el login no gasta cupo del registro. */
  bucket: string;
  /** Variable de entorno que fija el límite por hora, y su valor por defecto. */
  envKey: string;
  defaultPerHour: number;
}

/** Límite de intentos por IP y por hora en la ruta. Usar con `@UseGuards(RateLimitGuard)`. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Contadores del proceso, uno por bucket. Provider singleton aparte del guard para que el
 * estado no dependa de cuántas instancias del guard cree Nest.
 */
@Injectable()
export class RateLimitStore {
  private readonly limiters = new Map<string, SlidingWindowLimiter>();

  limiter(bucket: string): SlidingWindowLimiter {
    let limiter = this.limiters.get(bucket);
    if (!limiter) {
      limiter = new SlidingWindowLimiter(HOUR_MS);
      this.limiters.set(bucket, limiter);
    }
    return limiter;
  }
}

/**
 * Anti-abuso de las rutas públicas de plataforma (registro, login de plataforma). Cuenta
 * TODO intento, válido o no: también frena a quien prueba slugs o claves.
 *
 * La IP es `req.ip`: detrás de Traefik, con `trust proxy` (main.ts), es la del cliente.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly store: RateLimitStore,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) {
      throw new Error('RateLimitGuard exige @RateLimit() en la ruta');
    }

    const limit = this.limitFor(options);
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    const retryInMs = this.store.limiter(options.bucket).hit(key, limit, Date.now());
    if (retryInMs === null) return true;

    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(Math.ceil(retryInMs / 1000)));
    throw new HttpException(
      'Demasiados intentos desde esta conexión. Intenta de nuevo más tarde.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private limitFor(options: RateLimitOptions): number {
    const raw = this.config.get<string>(options.envKey);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : options.defaultPerHour;
  }
}
