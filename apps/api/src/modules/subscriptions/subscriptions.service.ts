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
   */
  async expireTrial(tenantId: string, subscriptionId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({
        where: { tenantId, id: subscriptionId, status: 'trialing', trialEndsAt: { lte: now } },
        data: { status: 'past_due' },
      });
      if (count === 0) return;
      await tx.billingEvent.create({
        data: { tenantId, type: 'trial_expired', message: 'Prueba vencida sin pago' },
      });
      this.logger.log(`Prueba vencida: tenant ${tenantId} → past_due`);
    });
  }
}
