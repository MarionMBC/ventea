import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AppRequestQueueItem,
  AppRequestsQuery,
  AppStatus,
  BuildConfig,
  PlatformApp,
  PushCredentialsInput,
  PushStatus,
  UpdatePlatformAppInput,
} from '@ventea/shared';

import type { PlatformPrincipal } from '@/common/auth/auth.context';
import { absoluteMediaUrl } from '@/modules/media/media-url';
import { isPlanCode } from '@/modules/platform/platform.mapper';
import { PushCredentialsService } from '@/modules/push/push-credentials.service';
import { brandLanguage } from '@/modules/push/push-messages';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { AppConfigStore } from './app-config.store';
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY } from './brand.service';

/** Estados que están en la cola de trabajo de la plataforma (todo lo pedido y no publicado). */
const QUEUE_STATUSES: AppStatus[] = ['requested', 'building', 'in_review'];
const DETAIL_EVENTS = 20;

/**
 * App de cada marca vista desde la plataforma (TASK-016): cola de solicitudes, edición
 * (bundle id, quién publica, estado, versión, links de tienda), configuración para el
 * generador (TASK-019) y credenciales push. Cruza marcas: lee por `Tenant` (exento del guard).
 */
@Injectable()
export class PlatformAppService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly apps: AppConfigStore,
    private readonly pushCredentials: PushCredentialsService,
  ) {}

  async queue(query: AppRequestsQuery): Promise<AppRequestQueueItem[]> {
    const statuses = query.status ? [query.status] : QUEUE_STATUSES;
    const tenants = await this.prisma.tenant.findMany({
      where: { appConfig: { status: { in: statuses } } },
      include: { appConfig: true, subscription: { select: { plan: { select: { code: true } } } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return tenants
      .filter((tenant) => tenant.appConfig)
      .map((tenant) => {
        const config = tenant.appConfig!;
        const code = tenant.subscription?.plan.code;
        return {
          slug: tenant.slug,
          name: tenant.name,
          planCode: code && isPlanCode(code) ? code : null,
          status: config.status,
          publisher: config.publisher,
          bundleId: config.bundleId,
          requestedAt: config.requestedAt,
          updatedAt: config.updatedAt,
        };
      })
      .sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0));
  }

  async detail(slug: string): Promise<PlatformApp> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: {
        appConfig: true,
        appConfigEvents: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: DETAIL_EVENTS },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    const plan = await this.apps.plan(tenant.id);
    const view = this.apps.view(tenant, tenant.appConfig, plan.code);
    return {
      tenant: { slug: tenant.slug, name: tenant.name, planCode: plan.code },
      exists: view.exists,
      bundleId: view.bundleId,
      publisher: view.publisher,
      status: view.status,
      version: view.version,
      buildNumber: view.buildNumber,
      storeUrls: { android: view.storeUrlAndroid, ios: view.storeUrlIos },
      requestedAt: view.requestedAt,
      push: pushStatus(view),
      events: tenant.appConfigEvents.map((event) => ({
        type: event.type,
        actor: event.actor,
        message: event.message,
        createdAt: event.createdAt,
      })),
    };
  }

  async update(
    slug: string,
    admin: PlatformPrincipal,
    input: UpdatePlatformAppInput,
  ): Promise<PlatformApp> {
    const tenant = await this.tenantBySlug(slug);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`app-config:${tenant.id}`}))`;
        const config = await this.apps.ensure(tx, tenant);
        if (input.bundleId && (await this.apps.bundleIdTaken(tx, tenant.id, input.bundleId))) {
          throw new ConflictException('Otra marca ya usa ese bundleId');
        }
        const { storeUrls, ...fields } = input;
        const data: Prisma.AppConfigUncheckedUpdateManyInput = { ...fields };
        if (storeUrls?.android !== undefined) data.storeUrlAndroid = storeUrls.android;
        if (storeUrls?.ios !== undefined) data.storeUrlIos = storeUrls.ios;
        // Si la plataforma la mueve sin que el dueño la haya pedido, queda la fecha igual.
        if (input.status && input.status !== 'not_requested' && !config.requestedAt) {
          data.requestedAt = new Date();
        }
        await tx.appConfig.updateMany({ where: { tenantId: tenant.id }, data });
        await tx.appConfigEvent.create({
          data: {
            tenantId: tenant.id,
            type: 'updated',
            actor: admin.email,
            message: JSON.stringify(input).slice(0, 1000),
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Otra marca ya usa ese bundleId');
      throw error;
    }
    return this.detail(slug);
  }

  async buildConfig(slug: string, base: string): Promise<BuildConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { branding: true, appConfig: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    const plan = await this.apps.plan(tenant.id);
    const view = this.apps.view(tenant, tenant.appConfig, plan.code);
    const b = tenant.branding;
    return {
      tenant: { slug: tenant.slug, name: tenant.name, currency: tenant.currency },
      apiBaseUrl: `${base}/api`,
      branding: {
        appDisplayName: b?.appDisplayName ?? tenant.name,
        primaryColor: b?.primaryColor ?? DEFAULT_PRIMARY,
        secondaryColor: b?.secondaryColor ?? DEFAULT_SECONDARY,
        accentColor: b?.accentColor ?? null,
        logoUrl: absoluteMediaUrl(b?.logoUrl, base),
        iconUrl: absoluteMediaUrl(b?.iconUrl, base),
        storeShortDescription: b?.storeShortDescription ?? null,
        supportEmail: b?.supportEmail ?? null,
        websiteUrl: b?.websiteUrl ?? null,
        language: brandLanguage(b?.language),
      },
      app: {
        bundleId: view.bundleId,
        publisher: view.publisher,
        status: view.status,
        version: view.version,
        buildNumber: view.buildNumber,
        storeUrls: { android: view.storeUrlAndroid, ios: view.storeUrlIos },
      },
      push: { configured: view.pushConfigured, projectId: view.pushProjectId },
    };
  }

  /** Guarda la service account cifrada. La respuesta solo dice si quedó configurada. */
  async setPushCredentials(
    slug: string,
    admin: PlatformPrincipal,
    input: PushCredentialsInput,
  ): Promise<PushStatus> {
    const tenant = await this.tenantBySlug(slug);
    const encrypted = this.pushCredentials.encrypt(tenant.id, input);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`app-config:${tenant.id}`}))`;
      await this.apps.ensure(tx, tenant);
      await tx.appConfig.updateMany({
        where: { tenantId: tenant.id },
        data: {
          pushCredentialsEnc: encrypted,
          pushProjectId: input.project_id,
          pushUpdatedAt: new Date(),
        },
      });
      await tx.appConfigEvent.create({
        data: {
          tenantId: tenant.id,
          type: 'push_credentials_set',
          actor: admin.email,
          message: `Proyecto ${input.project_id}`,
        },
      });
    });
    return pushStatus(await this.viewOf(tenant));
  }

  async clearPushCredentials(slug: string, admin: PlatformPrincipal): Promise<PushStatus> {
    const tenant = await this.tenantBySlug(slug);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.appConfig.updateMany({
        where: { tenantId: tenant.id, pushCredentialsEnc: { not: null } },
        data: { pushCredentialsEnc: null, pushProjectId: null, pushUpdatedAt: new Date() },
      });
      if (count > 0) {
        await tx.appConfigEvent.create({
          data: { tenantId: tenant.id, type: 'push_credentials_cleared', actor: admin.email },
        });
      }
    });
    return pushStatus(await this.viewOf(tenant));
  }

  private async tenantBySlug(slug: string): Promise<{ id: string; slug: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  private async viewOf(tenant: { id: string; slug: string }) {
    const row = await this.prisma.appConfig.findUnique({ where: { tenantId: tenant.id } });
    return this.apps.view(tenant, row, null);
  }
}

function pushStatus(view: {
  pushConfigured: boolean;
  pushProjectId: string | null;
  pushUpdatedAt: Date | null;
}): PushStatus {
  return {
    configured: view.pushConfigured,
    projectId: view.pushProjectId,
    updatedAt: view.pushUpdatedAt,
  };
}
