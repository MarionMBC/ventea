import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Brand, UpdateBrandInput } from '@ventea/shared';

import { MediaService } from '@/modules/media/media.service';
import { absoluteMediaUrl } from '@/modules/media/media-url';
import { brandLanguage } from '@/modules/push/push-messages';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { AppConfigStore } from './app-config.store';
import { brandWarnings } from './brand-rules';

/** Defaults del esquema (`TenantBranding`) para marcas sin fila de branding. */
export const DEFAULT_PRIMARY = '#E23B2E';
export const DEFAULT_SECONDARY = '#1F1D1B';

/**
 * Mi marca (dueño, TASK-016): identidad visual y datos de tienda, más el estado de su app
 * nativa (solo lectura: la operan la plataforma y el generador de TASK-019).
 */
@Injectable()
export class BrandService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly media: MediaService,
    private readonly apps: AppConfigStore,
  ) {}

  async get(tenantId: string, base: string): Promise<Brand> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { branding: true, appConfig: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    const plan = await this.apps.plan(tenantId);
    const app = tenant.appConfig ? this.apps.view(tenant, tenant.appConfig, plan.code) : null;
    const b = tenant.branding;

    const colors = {
      primaryColor: b?.primaryColor ?? DEFAULT_PRIMARY,
      secondaryColor: b?.secondaryColor ?? DEFAULT_SECONDARY,
      accentColor: b?.accentColor ?? null,
    };
    return {
      appDisplayName: b?.appDisplayName ?? tenant.name,
      ...colors,
      logoUrl: absoluteMediaUrl(b?.logoUrl, base),
      iconUrl: absoluteMediaUrl(b?.iconUrl, base),
      storeShortDescription: b?.storeShortDescription ?? null,
      supportEmail: b?.supportEmail ?? null,
      websiteUrl: b?.websiteUrl ?? null,
      language: brandLanguage(b?.language),
      warnings: brandWarnings(colors),
      app: {
        status: app?.status ?? 'not_requested',
        publisher: app?.publisher ?? null,
        bundleId: app?.bundleId ?? null,
        version: app?.version ?? null,
        storeUrls: { android: app?.storeUrlAndroid ?? null, ios: app?.storeUrlIos ?? null },
        requestedAt: app?.requestedAt ?? null,
        brandedAppAvailable: plan.brandedApp,
      },
    };
  }

  /** Logo e ícono tienen que ser medios subidos por la marca (400 si no). */
  async update(tenantId: string, input: UpdateBrandInput, base: string): Promise<Brand> {
    const { logoUrl, iconUrl, ...fields } = input;
    const data: Prisma.TenantBrandingUncheckedUpdateInput = { ...fields };
    if (logoUrl !== undefined) {
      data.logoUrl = logoUrl
        ? await this.media.resolveOwnedRef(tenantId, logoUrl, 'logoUrl')
        : null;
    }
    if (iconUrl !== undefined) {
      data.iconUrl = iconUrl
        ? await this.media.resolveOwnedRef(tenantId, iconUrl, 'iconUrl')
        : null;
    }

    await this.prisma.tenantBranding.upsert({
      where: { tenantId },
      update: data,
      create: { ...(data as Prisma.TenantBrandingUncheckedCreateInput), tenantId },
    });
    return this.get(tenantId, base);
  }

  /**
   * El dueño pide su app nativa. `403` si el plan no la incluye (solo Pro y Cadena), `409` si ya
   * la pidió. Deja la app en `requested` con un evento para la cola de la plataforma.
   */
  async requestApp(tenantId: string, staffId: string, base: string): Promise<Brand> {
    const plan = await this.apps.plan(tenantId);
    if (!plan.brandedApp) {
      throw new ForbiddenException({
        message: `Tu plan${plan.name ? ` ${plan.name}` : ''} no incluye app propia: está en los planes Pro y Cadena`,
        code: 'plan_limit',
        limit: { resource: 'branded_app', plan: plan.code, planName: plan.name, max: null },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`app-config:${tenantId}`}))`;
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true },
      });
      if (!tenant) throw new NotFoundException('Tenant no encontrado');
      const config = await this.apps.ensure(tx, tenant);
      if (config.status !== 'not_requested') {
        throw new ConflictException(`La app ya fue solicitada (estado: ${config.status})`);
      }
      await tx.appConfig.updateMany({
        where: { tenantId },
        data: { status: 'requested', requestedAt: new Date() },
      });
      await tx.appConfigEvent.create({
        data: {
          tenantId,
          type: 'requested',
          actor: `staff:${staffId}`,
          message: 'Solicitud del dueño',
        },
      });
    });
    return this.get(tenantId, base);
  }
}
