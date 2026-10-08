import type { Prisma } from '@prisma/client';
import {
  PLAN_CODE,
  planFeaturesSchema,
  type Plan,
  type PlanCode,
  type PlatformTenant,
} from '@ventea/shared';

/** Features sin la forma esperada (JSON editado a mano) cuentan como apagadas. */
const NO_FEATURES = {
  brandedApp: false,
  customDomain: false,
  reports: false,
  prioritySupport: false,
};

export function isPlanCode(code: string): code is PlanCode {
  return (PLAN_CODE as readonly string[]).includes(code);
}

export function toPlan(plan: {
  code: string;
  name: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  currency: string;
  maxLocations: number | null;
  features: Prisma.JsonValue;
}): Plan | null {
  if (!isPlanCode(plan.code)) return null;
  const features = planFeaturesSchema.safeParse(plan.features);
  return {
    code: plan.code,
    name: plan.name,
    priceMonthlyCents: plan.priceMonthlyCents,
    priceYearlyCents: plan.priceYearlyCents,
    currency: plan.currency,
    maxLocations: plan.maxLocations,
    features: features.success ? features.data : NO_FEATURES,
  };
}

/** Lo que el panel de plataforma lee de cada marca (consulta por `Tenant`, exento del guard). */
export const PLATFORM_TENANT_INCLUDE = {
  subscription: { include: { plan: { select: { code: true } } } },
} satisfies Prisma.TenantInclude;

type TenantWithSubscription = Prisma.TenantGetPayload<{ include: typeof PLATFORM_TENANT_INCLUDE }>;

export function toPlatformTenant(
  tenant: TenantWithSubscription,
  ordersLast30Days: number,
): PlatformTenant {
  const { subscription } = tenant;
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    region: tenant.region,
    createdVia: tenant.createdVia,
    isActive: tenant.isActive,
    createdAt: tenant.createdAt,
    subscription:
      subscription && isPlanCode(subscription.plan.code)
        ? {
            status: subscription.status,
            planCode: subscription.plan.code,
            interval: subscription.interval,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
    ordersLast30Days,
  };
}
