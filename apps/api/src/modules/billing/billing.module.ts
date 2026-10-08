import { Module } from '@nestjs/common';

import { RateLimitGuard, RateLimitStore } from '@/modules/platform/rate-limit.guard';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

import { BillingCycleService } from './billing-cycle.service';
import { BillingLockService } from './billing-lock.service';
import { BILLING_NOTIFIER, LogBillingNotifier } from './billing-notifier';
import { BillingOutcomeService } from './billing-outcome.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';
import { BillingService } from './billing.service';
import { paymentGatewayProvider } from './gateway/gateway.provider';
import { PlatformBillingService } from './platform-billing.service';

/**
 * Cobro recurrente de la suscripción (TASK-005): pasarela según `BILLING_MODE`, rutas del
 * dueño (`/api/billing/*`), ciclo de renovación con scheduler y lo que usa la plataforma.
 */
@Module({
  imports: [SubscriptionsModule],
  controllers: [BillingController],
  providers: [
    paymentGatewayProvider,
    { provide: BILLING_NOTIFIER, useClass: LogBillingNotifier },
    BillingLockService,
    BillingOutcomeService,
    BillingService,
    BillingCycleService,
    BillingScheduler,
    PlatformBillingService,
    RateLimitStore,
    RateLimitGuard,
  ],
  exports: [BillingCycleService, PlatformBillingService],
})
export class BillingModule {}
