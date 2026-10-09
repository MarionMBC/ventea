import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@prisma/client';
import type { PlanCode } from '@ventea/shared';

import { toPlan } from '@/modules/platform/platform.mapper';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { defaultBundleId, defaultPublisher } from './brand-rules';

export interface TenantPlan {
  code: PlanCode | null;
  name: string | null;
  brandedApp: boolean;
}

/** Valores de una marca sin fila de `AppConfig` (nunca pidió la app). */
export interface AppConfigView {
  exists: boolean;
  bundleId: string;
  publisher: AppConfig['publisher'];
  status: AppConfig['status'];
  version: string | null;
  buildNumber: number | null;
  storeUrlAndroid: string | null;
  storeUrlIos: string | null;
  requestedAt: Date | null;
  pushConfigured: boolean;
  pushProjectId: string | null;
  pushUpdatedAt: Date | null;
}

/**
 * Lectura y alta de la `AppConfig` de una marca y de su plan. La fila nace con la solicitud
 * del dueño o con el primer cambio de la plataforma; antes se muestran los valores por defecto.
 */
@Injectable()
export class AppConfigStore {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  async plan(tenantId: string, db: PrismaDb = this.prisma): Promise<TenantPlan> {
    const subscription = await db.subscription.findUnique({
      where: { tenantId },
      select: { plan: true },
    });
    const plan = subscription ? toPlan(subscription.plan) : null;
    return {
      code: plan?.code ?? null,
      name: plan?.name ?? subscription?.plan.name ?? null,
      brandedApp: plan?.features.brandedApp ?? false,
    };
  }

  view(tenant: { slug: string }, row: AppConfig | null, planCode: PlanCode | null): AppConfigView {
    return {
      exists: row !== null,
      bundleId: row?.bundleId ?? defaultBundleId(tenant.slug),
      publisher: row?.publisher ?? defaultPublisher(planCode),
      status: row?.status ?? 'not_requested',
      version: row?.version ?? null,
      buildNumber: row?.buildNumber ?? null,
      storeUrlAndroid: row?.storeUrlAndroid ?? null,
      storeUrlIos: row?.storeUrlIos ?? null,
      requestedAt: row?.requestedAt ?? null,
      pushConfigured: !!row?.pushCredentialsEnc,
      pushProjectId: row?.pushProjectId ?? null,
      pushUpdatedAt: row?.pushUpdatedAt ?? null,
    };
  }

  /** La fila de la marca, creándola con los valores por defecto si no existe. */
  async ensure(db: PrismaDb, tenant: { id: string; slug: string }): Promise<AppConfig> {
    const existing = await db.appConfig.findUnique({ where: { tenantId: tenant.id } });
    if (existing) return existing;

    const plan = await this.plan(tenant.id, db);
    let bundleId = defaultBundleId(tenant.slug);
    // `a-b` y `ab` dan el mismo bundle id: el segundo lleva un sufijo de su id.
    if (await this.bundleIdTaken(db, tenant.id, bundleId)) {
      bundleId = `${bundleId}${tenant.id.replace(/-/g, '').slice(0, 8)}`;
    }
    return db.appConfig.create({
      data: { tenantId: tenant.id, bundleId, publisher: defaultPublisher(plan.code) },
    });
  }

  /** ¿Otra marca ya usa este bundle id? (es único en todas las tiendas, no por marca). */
  async bundleIdTaken(db: PrismaDb, tenantId: string, bundleId: string): Promise<boolean> {
    const other = await db.appConfig.findFirst({
      where: { tenantId: { not: tenantId }, bundleId },
      select: { tenantId: true },
    });
    return other !== null;
  }
}
