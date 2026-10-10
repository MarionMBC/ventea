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

import { AUTH_REQUEST_KEY, type AuthPrincipal } from '@/common/auth/auth.context';
import { TENANT_REQUEST_KEY } from '@/common/tenant.context';

import { SlidingWindowLimiter } from './rate-limit';

const RATE_LIMIT_KEY = 'ventea:rate-limit';
const HOUR_MS = 60 * 60 * 1000;

export interface RateLimitOptions {
  /** Contador independiente por ruta: el login no gasta cupo del registro. */
  bucket: string;
  /** Variable de entorno que fija el límite por ventana, y su valor por defecto. */
  envKey: string;
  defaultPerHour: number;
  /** Largo de la ventana en horas (default 1: el límite es por hora). */
  windowHours?: number;
  /**
   * Qué se cuenta: la IP (default), la marca del request (`tenant`, rutas de marca
   * autenticadas: el cobro de la suscripción limita por marca, no por conexión) o la sesión
   * (`principal`: el cliente o staff autenticado; exige el guard de auth antes que este).
   */
  key?: 'ip' | 'tenant' | 'principal';
}

/**
 * Límite de intentos por IP (o por marca) y por ventana. Varias reglas a la vez se pasan como
 * argumentos y se aplican todas. Usar con `@UseGuards(RateLimitGuard)`.
 */
export const RateLimit = (...options: RateLimitOptions[]) => SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Contadores del proceso, uno por bucket. Provider singleton aparte del guard para que el
 * estado no dependa de cuántas instancias del guard cree Nest.
 */
@Injectable()
export class RateLimitStore {
  private readonly limiters = new Map<string, SlidingWindowLimiter>();

  limiter(bucket: string, windowMs = HOUR_MS): SlidingWindowLimiter {
    let limiter = this.limiters.get(bucket);
    if (!limiter) {
      limiter = new SlidingWindowLimiter(windowMs);
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
    const rules = this.reflector.get<RateLimitOptions[] | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!rules || rules.length === 0) {
      throw new Error('RateLimitGuard exige @RateLimit() en la ruta');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    // Primero se chequean TODAS las reglas y recién después se registra el intento en cada una:
    // un pedido que frena la regla por IP no gasta cupo de la regla por marca (ni al revés).
    const checked = rules.map((options) => {
      const key =
        options.key === 'principal'
          ? principalKey(request)
          : options.key === 'tenant'
            ? tenantKey(request)
            : ipKey(request);
      const limiter = this.store.limiter(options.bucket, (options.windowHours ?? 1) * HOUR_MS);
      return { options, key, limiter, retryInMs: limiter.check(key, this.limitFor(options), now) };
    });

    const blocked = checked.find((rule) => rule.retryInMs !== null);
    if (!blocked) {
      for (const rule of checked) rule.limiter.record(rule.key, now);
      return true;
    }

    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(Math.ceil(blocked.retryInMs! / 1000)));
    throw new HttpException(
      blocked.options.key === 'tenant'
        ? 'Demasiados intentos para esta marca. Intenta de nuevo más tarde.'
        : 'Demasiados intentos desde esta conexión. Intenta de nuevo más tarde.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private limitFor(options: RateLimitOptions): number {
    const raw = this.config.get<string>(options.envKey);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : options.defaultPerHour;
  }
}

function ipKey(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

function principalKey(request: Request): string {
  const principal = (request as unknown as Record<string, unknown>)[AUTH_REQUEST_KEY] as
    AuthPrincipal | undefined;
  if (!principal) {
    // Programación defensiva: `key: 'principal'` sin @CustomerAuth/@StaffAuth antes.
    throw new Error('RateLimit por sesión en una ruta sin sesión');
  }
  return `${principal.kind}:${principal.tenantId}:${principal.id}`;
}

function tenantKey(request: Request): string {
  const tenant = (request as unknown as Record<string, unknown>)[TENANT_REQUEST_KEY] as
    { tenantId: string } | undefined;
  if (!tenant) {
    // Programación defensiva: `key: 'tenant'` en una ruta fuera del TenantMiddleware.
    throw new Error('RateLimit por tenant en una ruta sin tenant');
  }
  return `tenant:${tenant.tenantId}`;
}
