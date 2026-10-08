import { Inject, Injectable } from '@nestjs/common';
import type { RewardBalance, RewardLedgerEntry } from '@ventea/shared';

import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { pointsForOrder, type RewardProgramRules } from './points';

/** Prefijo de la nota del asiento que devuelve un canje al cancelar el pedido. */
export const REFUND_NOTE_PREFIX = 'refund:';

/**
 * Libro de puntos. Todo cambio de saldo es un asiento nuevo (append-only): el saldo
 * es la suma. Los métodos que escriben reciben el `tx` de quien llama para quedar
 * dentro de la misma transacción que el pedido o el registro.
 */
@Injectable()
export class RewardsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  async program(db: PrismaDb, tenantId: string): Promise<RewardProgramRules | null> {
    return db.rewardProgram.findFirst({
      where: { tenantId },
      select: {
        isEnabled: true,
        pointsPerCurrencyUnit: true,
        redemptionValueCents: true,
        minPointsToRedeem: true,
      },
    });
  }

  async balance(db: PrismaDb, tenantId: string, customerId: string): Promise<number> {
    const result = await db.rewardLedgerEntry.aggregate({
      where: { tenantId, customerId },
      _sum: { points: true },
    });
    return result._sum.points ?? 0;
  }

  async getBalance(tenantId: string, customerId: string): Promise<RewardBalance> {
    const [balance, earned] = await Promise.all([
      this.balance(this.prisma, tenantId, customerId),
      this.prisma.rewardLedgerEntry.aggregate({
        where: { tenantId, customerId, points: { gt: 0 } },
        _sum: { points: true },
      }),
    ]);
    return {
      customerId,
      balance: Math.max(balance, 0),
      lifetimeEarned: earned._sum.points ?? 0,
    };
  }

  async getLedger(tenantId: string, customerId: string): Promise<RewardLedgerEntry[]> {
    const entries = await this.prisma.rewardLedgerEntry.findMany({
      where: { tenantId, customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return entries.map((entry) => ({
      id: entry.id,
      points: entry.points,
      reason: entry.reason,
      orderId: entry.orderId,
      note: entry.note,
      createdAt: entry.createdAt,
    }));
  }

  /** Bono de registro, si el programa está activo y lo define. */
  async grantSignupBonus(db: PrismaDb, tenantId: string, customerId: string): Promise<void> {
    const program = await db.rewardProgram.findFirst({
      where: { tenantId },
      select: { isEnabled: true, signupBonusPoints: true },
    });
    if (!program?.isEnabled || program.signupBonusPoints <= 0) return;

    await db.rewardLedgerEntry.create({
      data: { tenantId, customerId, points: program.signupBonusPoints, reason: 'signup_bonus' },
    });
  }

  async debitRedemption(
    db: PrismaDb,
    tenantId: string,
    customerId: string,
    orderId: string,
    points: number,
  ): Promise<void> {
    await db.rewardLedgerEntry.create({
      data: { tenantId, customerId, orderId, points: -points, reason: 'redemption' },
    });
  }

  /**
   * Acredita los puntos de un pedido completado. Idempotente: si el pedido ya tiene
   * su asiento `order_earned`, no se repite. Devuelve los puntos del pedido.
   */
  async creditOrderEarned(
    db: PrismaDb,
    tenantId: string,
    order: { id: string; customerId: string | null; totalCents: number },
  ): Promise<number> {
    if (!order.customerId) return 0;

    const existing = await db.rewardLedgerEntry.findFirst({
      where: { tenantId, orderId: order.id, reason: 'order_earned' },
      select: { points: true },
    });
    if (existing) return existing.points;

    const program = await this.program(db, tenantId);
    if (!program?.isEnabled) return 0;

    const points = pointsForOrder(order.totalCents, program.pointsPerCurrencyUnit);
    if (points <= 0) return 0;

    await db.rewardLedgerEntry.create({
      data: {
        tenantId,
        customerId: order.customerId,
        orderId: order.id,
        points,
        reason: 'order_earned',
      },
    });
    return points;
  }

  /** Devuelve los puntos canjeados en un pedido cancelado. Idempotente por pedido. */
  async refundRedemption(
    db: PrismaDb,
    tenantId: string,
    order: { id: string; customerId: string | null; pointsRedeemed: number },
  ): Promise<void> {
    if (!order.customerId || order.pointsRedeemed <= 0) return;

    const note = `${REFUND_NOTE_PREFIX}${order.id}`;
    const existing = await db.rewardLedgerEntry.findFirst({
      where: { tenantId, orderId: order.id, reason: 'manual_adjustment', note },
      select: { id: true },
    });
    if (existing) return;

    await db.rewardLedgerEntry.create({
      data: {
        tenantId,
        customerId: order.customerId,
        orderId: order.id,
        points: order.pointsRedeemed,
        reason: 'manual_adjustment',
        note,
      },
    });
  }
}
