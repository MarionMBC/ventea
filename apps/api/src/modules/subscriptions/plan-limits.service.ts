import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';

import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { canAddLocation, fitsLocationLimit } from './plan-limits';

/**
 * Límites del plan contratado. Hoy no hay endpoint de alta de sucursales: el que lo
 * agregue llama a `assertCanAddLocation` dentro de su transacción, antes del `create`.
 */
@Injectable()
export class PlanLimitsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /** 403 si el plan de la marca no admite otra sucursal activa. */
  async assertCanAddLocation(tenantId: string, db: PrismaDb = this.prisma): Promise<void> {
    const subscription = await db.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { name: true, maxLocations: true } } },
    });
    // Sin suscripción no hay plan que limite (ver accessDecision: falla abierta).
    if (!subscription) return;

    const active = await db.location.count({ where: { tenantId, isActive: true } });
    const { name, maxLocations } = subscription.plan;
    if (!canAddLocation(maxLocations, active)) {
      throw new ForbiddenException(
        `El plan ${name} permite hasta ${locationsLabel(maxLocations ?? 0)}`,
      );
    }
  }

  /** 409 si la marca tiene más sucursales activas de las que permite el plan destino. */
  async assertFitsPlan(
    tenantId: string,
    plan: { name: string; maxLocations: number | null },
    db: PrismaDb = this.prisma,
  ): Promise<void> {
    const active = await db.location.count({ where: { tenantId, isActive: true } });
    if (!fitsLocationLimit(plan.maxLocations, active)) {
      throw new ConflictException(
        `La marca tiene ${locationsLabel(active)} y el plan ${plan.name} permite ${plan.maxLocations}`,
      );
    }
  }
}

function locationsLabel(count: number): string {
  return count === 1 ? '1 sucursal activa' : `${count} sucursales activas`;
}
