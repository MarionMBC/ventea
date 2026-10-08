import { Inject, Injectable, NotFoundException, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TENANT_HEADER } from '@ventea/shared';
import type { NextFunction, Request, Response } from 'express';

import { TENANT_REQUEST_KEY } from '@/common/tenant.context';
import {
  SUBSCRIPTION_REQUEST_KEY,
  type SubscriptionContext,
} from '@/modules/subscriptions/subscription.context';
import { PRISMA } from '@/prisma/prisma.module';
import type { PrismaClientExtended } from '@/prisma/prisma.client';

/**
 * Resuelve el tenant de CADA request antes que cualquier controlador. En la misma
 * consulta trae el estado de la suscripción, que mira después el SubscriptionMiddleware.
 *
 * Hay dos modos de despliegue, y cambian de dónde sale el tenant:
 *
 * `TENANT_MODE=multi` — producción (SaaS, ADR 0007): todas las marcas en la misma
 *   instancia. El tenant sale, en este orden:
 *     1. Subdominio  — `carolina-hot-chicken.ventea.tech`
 *     2. Header      — `X-Tenant-Slug` (apps nativas: no tienen host propio)
 *     3. Fallback    — `DEFAULT_TENANT_SLUG`, SOLO fuera de producción
 *
 * `TENANT_MODE=single` — instalación dedicada a UNA marca (excepcional). El slug se
 *   fija en `TENANT_SLUG` y no se lee de la petición: nada que mande el cliente puede
 *   cambiarlo.
 *
 * En ningún modo el slug sale del body ni de un query param: son campos que el
 * cliente controla en cada petición y permitirían saltar de tenant a voluntad.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = this.resolveSlug(req);

    if (!slug) {
      throw new NotFoundException('No se pudo determinar el tenant de la petición');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        isActive: true,
        subscription: {
          select: { id: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
        },
      },
    });

    if (!tenant || !tenant.isActive) {
      // Mismo error para "no existe" y "suspendido": distinguirlos permitiría
      // enumerar qué marcas usan la plataforma.
      throw new NotFoundException('Tenant no encontrado');
    }

    const request = req as unknown as Record<string, unknown>;
    request[TENANT_REQUEST_KEY] = { tenantId: tenant.id, slug: tenant.slug };
    const subscription: SubscriptionContext | null = tenant.subscription;
    request[SUBSCRIPTION_REQUEST_KEY] = subscription;

    next();
  }

  private resolveSlug(req: Request): string | undefined {
    if (this.config.get<string>('TENANT_MODE', 'single') === 'single') {
      const slug = this.config.get<string>('TENANT_SLUG');
      if (!slug) {
        // Sin esto, una instancia mal configurada caería al modo multi y
        // empezaría a resolver el tenant por subdominio sin que nadie lo note.
        throw new Error('TENANT_MODE=single exige TENANT_SLUG');
      }
      return slug;
    }

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
