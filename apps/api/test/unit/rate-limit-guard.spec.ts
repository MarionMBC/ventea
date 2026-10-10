import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';

import { TENANT_REQUEST_KEY } from '@/common/tenant.context';
import {
  RateLimitGuard,
  RateLimitStore,
  type RateLimitOptions,
} from '@/modules/platform/rate-limit.guard';

/** Las dos reglas del alta de tarjeta: por marca y por IP (ver billing.controller.ts). */
const RULES: RateLimitOptions[] = [
  { bucket: 'by-tenant', envKey: 'TENANT_LIMIT', defaultPerHour: 5, key: 'tenant' },
  { bucket: 'by-ip', envKey: 'IP_LIMIT', defaultPerHour: 1, windowHours: 24 },
];

function guardWith(rules: RateLimitOptions[]): RateLimitGuard {
  const reflector = { get: () => rules } as unknown as Reflector;
  const config = { get: () => undefined } as unknown as ConfigService;
  return new RateLimitGuard(reflector, config, new RateLimitStore());
}

const headers: Record<string, string> = {};

function contextFrom(ip: string, tenantId = 'tenant-1'): ExecutionContext {
  const request = { ip, [TENANT_REQUEST_KEY]: { tenantId } };
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  return {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

function passes(guard: RateLimitGuard, ip: string): boolean {
  try {
    return guard.canActivate(contextFrom(ip));
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === 429) return false;
    throw error;
  }
}

describe('RateLimitGuard con varias reglas', () => {
  it('un pedido que frena la regla por IP no gasta el cupo de la marca', () => {
    const guard = guardWith(RULES);
    expect(passes(guard, '1.1.1.1')).toBe(true);
    // La misma IP ya gastó su único intento del día: 429 por IP, sin tocar el cupo de la marca.
    for (let i = 0; i < 3; i++) expect(passes(guard, '1.1.1.1')).toBe(false);
    // Quedan 4 de 5 intentos para la marca desde otras conexiones.
    for (let i = 2; i <= 5; i++) expect(passes(guard, `2.2.2.${i}`)).toBe(true);
    expect(passes(guard, '2.2.2.9')).toBe(false);
  });

  it('un pedido que frena la regla por marca no gasta el cupo de la IP', () => {
    // Orden inverso: la regla que frena es la segunda.
    const guard = guardWith([
      { bucket: 'by-ip', envKey: 'IP_LIMIT', defaultPerHour: 2 },
      { bucket: 'by-tenant', envKey: 'TENANT_LIMIT', defaultPerHour: 1, key: 'tenant' },
    ]);
    expect(guard.canActivate(contextFrom('3.3.3.3', 'a'))).toBe(true);
    expect(() => guard.canActivate(contextFrom('3.3.3.3', 'a'))).toThrow(HttpException);
    // La IP usó 1 de 2: otra marca desde la misma IP todavía entra.
    expect(guard.canActivate(contextFrom('3.3.3.3', 'b'))).toBe(true);
  });

  it('Retry-After es la mayor espera entre las reglas que frenan', () => {
    // Por hora (marca, 1) y por día (IP, 1): el segundo pedido choca con las dos.
    const guard = guardWith([
      { bucket: 'by-tenant', envKey: 'TENANT_LIMIT', defaultPerHour: 1, key: 'tenant' },
      { bucket: 'by-ip', envKey: 'IP_LIMIT', defaultPerHour: 1, windowHours: 24 },
    ]);
    expect(guard.canActivate(contextFrom('4.4.4.4'))).toBe(true);
    expect(() => guard.canActivate(contextFrom('4.4.4.4'))).toThrow(HttpException);
    expect(Number(headers['Retry-After'])).toBeGreaterThan(23 * 60 * 60);
  });
});
