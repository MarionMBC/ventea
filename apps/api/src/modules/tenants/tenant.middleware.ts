import { Injectable, NotFoundException, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TENANT_HEADER } from '@ventea/shared';
import type { NextFunction, Request, Response } from 'express';

import { TENANT_REQUEST_KEY } from '@/common/tenant.context';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Resuelve el tenant de CADA request antes que cualquier controlador.
 *
 * Orden de resolución:
 *   1. Subdominio  — `carolina-hot-chicken.ventea.app` (web pública)
 *   2. Header      — `X-Tenant-Slug` (apps nativas: no tienen host propio)
 *   3. Fallback    — DEFAULT_TENANT_SLUG, SOLO en desarrollo
 *
 * El slug jamás se toma del body ni de un query param: son campos que el cliente
 * controla en cualquier request y permitirían saltar de tenant a voluntad.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = this.resolveSlug(req);

    if (!slug) {
      throw new NotFoundException('No se pudo determinar el tenant de la petición');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) {
      // Mismo error para "no existe" y "suspendido": no revelamos qué marcas existen.
      throw new NotFoundException('Tenant no encontrado');
    }

    (req as unknown as Record<string, unknown>)[TENANT_REQUEST_KEY] = {
      tenantId: tenant.id,
      slug: tenant.slug,
    };

    next();
  }

  private resolveSlug(req: Request): string | undefined {
    const baseDomain = this.config.get<string>('TENANT_BASE_DOMAIN');
    const host = req.hostname;

    if (baseDomain && host.endsWith(`.${baseDomain}`)) {
      const subdomain = host.slice(0, -(baseDomain.length + 1));
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        return subdomain;
      }
    }

    const header = req.headers[TENANT_HEADER];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }

    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return this.config.get<string>('DEFAULT_TENANT_SLUG');
    }

    return undefined;
  }
}
