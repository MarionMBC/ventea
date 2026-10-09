import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { PLAN_CODE, type PlanCode, type PlanUsage } from '@ventea/shared';

import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { canAddLocation, canAddStaff, fitsLocationLimit } from './plan-limits';

type PlanRow = { code: string; name: string; maxLocations: number | null; maxStaff: number | null };

/**
 * Límites del plan contratado. Quien da de alta (o reactiva) una sucursal o un usuario del
 * panel llama al `assertCanAdd…` dentro de su transacción, antes de escribir (TASK-022).
 */
@Injectable()
export class PlanLimitsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /** 403 si el plan de la marca no admite otra sucursal activa. */
  async assertCanAddLocation(tenantId: string, db: PrismaDb = this.prisma): Promise<void> {
    const subscription = await db.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { code: true, name: true, maxLocations: true } } },
    });
    // Sin suscripción no hay plan que limite (ver accessDecision: falla abierta).
    if (!subscription) return;

    const active = await db.location.count({ where: { tenantId, isActive: true } });
    const { code, name, maxLocations } = subscription.plan;
    if (!canAddLocation(maxLocations, active)) {
      throw new ForbiddenException({
        message: `El plan ${name} permite hasta ${locationsLabel(maxLocations ?? 0)}`,
        code: 'plan_limit',
        limit: { resource: 'locations', plan: code, planName: name, max: maxLocations ?? 0 },
      });
    }
  }

  /** Sucursales activas contra el tope del plan (lo muestra el panel). */
  async locationUsage(tenantId: string, db: PrismaDb = this.prisma): Promise<PlanUsage> {
    const [plan, used] = await Promise.all([
      this.planOf(tenantId, db),
      db.location.count({ where: { tenantId, isActive: true } }),
    ]);
    return usage(used, plan?.maxLocations ?? null, plan);
  }

  /**
   * Usuarios del panel contra el tope del plan: miembros activos + invitaciones pendientes y
   * vigentes (una invitación ya reserva su lugar). `excludeInvitationId`: la que se está
   * aceptando, que pasa de pendiente a miembro y no cuenta dos veces.
   */
  async staffUsage(
    tenantId: string,
    db: PrismaDb = this.prisma,
    now = new Date(),
    excludeInvitationId?: string,
  ): Promise<PlanUsage> {
    const [plan, members, invitations] = await Promise.all([
      this.planOf(tenantId, db),
      db.staffMember.count({ where: { tenantId, isActive: true } }),
      db.staffInvitation.count({
        where: {
          tenantId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          ...(excludeInvitationId ? { id: { not: excludeInvitationId } } : {}),
        },
      }),
    ]);
    return usage(members + invitations, plan?.maxStaff ?? null, plan);
  }

  /** 403 `plan_limit` (`staff`) si el plan no admite otro usuario del panel. */
  async assertCanAddStaff(
    tenantId: string,
    db: PrismaDb = this.prisma,
    excludeInvitationId?: string,
  ): Promise<void> {
    const current = await this.staffUsage(tenantId, db, new Date(), excludeInvitationId);
    if (canAddStaff(current.max, current.used)) return;
    const max = current.max ?? 0;
    throw new ForbiddenException({
      message: `El plan ${current.planName ?? ''} permite hasta ${max === 1 ? '1 usuario' : `${max} usuarios`} en el panel`,
      code: 'plan_limit',
      limit: { resource: 'staff', plan: current.plan, planName: current.planName, max },
    });
  }

  private async planOf(tenantId: string, db: PrismaDb): Promise<PlanRow | null> {
    const subscription = await db.subscription.findUnique({
      where: { tenantId },
      select: {
        plan: { select: { code: true, name: true, maxLocations: true, maxStaff: true } },
      },
    });
    return subscription?.plan ?? null;
  }

  /** 409 si la marca tiene más sucursales activas de las que permite el plan destino. */
  async assertFitsPlan(
    tenantId: string,
    plan: { code: string; name: string; maxLocations: number | null },
    db: PrismaDb = this.prisma,
  ): Promise<void> {
    const active = await db.location.count({ where: { tenantId, isActive: true } });
    if (!fitsLocationLimit(plan.maxLocations, active)) {
      throw new ConflictException({
        message: `La marca tiene ${locationsLabel(active)} y el plan ${plan.name} permite ${plan.maxLocations}`,
        code: 'plan_limit',
        limit: {
          resource: 'locations',
          plan: plan.code,
          planName: plan.name,
          max: plan.maxLocations,
        },
      });
    }
  }
}

function usage(used: number, max: number | null, plan: PlanRow | null): PlanUsage {
  return {
    used,
    max,
    plan: plan && isPlanCode(plan.code) ? plan.code : null,
    planName: plan?.name ?? null,
  };
}

function isPlanCode(code: string): code is PlanCode {
  return (PLAN_CODE as readonly string[]).includes(code);
}

function locationsLabel(count: number): string {
  return count === 1 ? '1 sucursal activa' : `${count} sucursales activas`;
}
