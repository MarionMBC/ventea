import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Cliente HTTP de la sonda. Inyectable para testear sin red. */
export const TENANT_READY_FETCH = Symbol('TENANT_READY_FETCH');
export type TenantReadyFetch = typeof fetch;

export const TENANT_READY_TIMEOUT_MS = 3_000;
export const TENANT_READY_CACHE_MS = 10_000;

interface CacheEntry {
  at: number;
  ready: Promise<boolean>;
}

/**
 * ¿La dirección de una marca recién registrada ya responde con HTTPS válido?
 *
 * Tras el alta, `https://<slug>.<dominio>` tarda 1-2 minutos: el cron publica la ruta en
 * Traefik y Let's Encrypt emite el certificado. Mientras tanto Traefik sirve su certificado
 * por defecto y, con HSTS, el navegador no deja seguir (ERR_CERT_AUTHORITY_INVALID). La
 * pantalla de éxito del registro pregunta acá antes de habilitar «Entrar a mi panel».
 *
 * La sonda es un GET a `/api/health` de la marca con la verificación TLS normal de Node: un
 * certificado inválido es un error de red → `false`. Solo para slugs que existen (404 si no):
 * el host se arma con el slug de la base y `TENANT_BASE_DOMAIN`, nunca con texto libre.
 * Cache de 10 s por slug (y una sola sonda en vuelo por slug): el polling de varias pestañas no
 * multiplica las salidas.
 */
@Injectable()
export class TenantReadyService {
  private readonly logger = new Logger(TenantReadyService.name);
  private readonly baseDomain: string;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly fetchImpl: TenantReadyFetch;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    config: ConfigService,
    @Optional() @Inject(TENANT_READY_FETCH) fetchImpl?: TenantReadyFetch,
  ) {
    this.baseDomain = config.get<string>('TENANT_BASE_DOMAIN') || 'ventea.tech';
    this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async isReady(slug: string, now = Date.now()): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { isActive: true },
    });
    if (!tenant?.isActive) throw new NotFoundException('No existe esa marca');

    this.sweep(now);
    const cached = this.cache.get(slug);
    if (cached && now - cached.at < TENANT_READY_CACHE_MS) return cached.ready;

    const ready = this.probe(slug);
    this.cache.set(slug, { at: now, ready });
    return ready;
  }

  private async probe(slug: string): Promise<boolean> {
    const url = `https://${slug}.${this.baseDomain}/api/health`;
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TENANT_READY_TIMEOUT_MS),
      });
      const ready = response.ok;
      // Solo importa el estado: se descarta el cuerpo para liberar la conexión ya (undici lo
      // retendría hasta el GC).
      await response.body?.cancel().catch(() => undefined);
      return ready;
    } catch (error) {
      // Lo esperado mientras no hay certificado (TLS) o la ruta no existe (timeout/DNS).
      this.logger.debug(`${slug} todavía no está lista: ${(error as Error).message}`);
      return false;
    }
  }

  private sweep(now: number): void {
    for (const [slug, entry] of this.cache) {
      if (now - entry.at >= TENANT_READY_CACHE_MS) this.cache.delete(slug);
    }
  }
}
