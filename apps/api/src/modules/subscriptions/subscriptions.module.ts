import { Module } from '@nestjs/common';

import { PlanLimitsService } from './plan-limits.service';
import { SubscriptionMiddleware, SubscriptionStateMiddleware } from './subscription.middleware';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  providers: [
    SubscriptionsService,
    SubscriptionMiddleware,
    SubscriptionStateMiddleware,
    PlanLimitsService,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionMiddleware,
    SubscriptionStateMiddleware,
    PlanLimitsService,
  ],
})
export class SubscriptionsModule {}
