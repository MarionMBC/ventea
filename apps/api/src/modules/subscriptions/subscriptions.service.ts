import { Inject, Injectable, Logger } from '@nestjs/common';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Operaciones de suscripción que dispara el propio tráfico de la marca. */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /**
   * Pasa a `past_due` una prueba vencida y deja el asiento `trial_expired`. Condicional
   * sobre el estado: dos requests simultáneos de la misma marca dejan un solo asiento.
   *
   * Con un cobro abierto (el dueño pagó y el banco no confirmó todavía, TASK-005) la prueba NO
   * se vence: devuelve `payment_pending` y la marca sigue atendiendo hasta que se resuelva.
   */
  async expireTrial(tenantId: string, subscriptionId: string, now: Date): Promise<TrialExpiry> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({
        where: {
          tenantId,
          id: subscriptionId,
          status: 'trialing',
          trialEndsAt: { lte: now },
          attempts: { none: { status: { in: OPEN_ATTEMPT_STATUSES } } },
        },
        data: { status: 'past_due' },
      });
      if (count === 0) {
        const open = await tx.paymentAttempt.count({
          where: { tenantId, subscriptionId, status: { in: OPEN_ATTEMPT_STATUSES } },
        });
        return open > 0 ? 'payment_pending' : 'unchanged';
      }
      await tx.billingEvent.create({
        data: { tenantId, type: 'trial_expired', message: 'Prueba vencida sin pago' },
      });
      this.logger.log(`Prueba vencida: tenant ${tenantId} → past_due`);
      return 'expired';
    });
  }
}

/**
 * Intento de cobro abierto (TASK-005): bloquea todo otro cobro y todo cambio de estado
 * automático. `needs_review` (aprobado distinto de lo pedido) también, pero no se concilia
 * solo: lo cierra una persona. Fuente única; billing la reexporta.
 */
export const OPEN_ATTEMPT_STATUSES: ('pending' | 'unknown' | 'needs_review')[] = [
  'pending',
  'unknown',
  'needs_review',
];

/** `payment_pending`: hay un cobro sin confirmar; la prueba sigue atendiendo. */
export type TrialExpiry = 'expired' | 'payment_pending' | 'unchanged';
