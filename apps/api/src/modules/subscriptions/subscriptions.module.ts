import { Module } from '@nestjs/common';

import { PlanLimitsService } from './plan-limits.service';
import { SubscriptionMiddleware } from './subscription.middleware';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  providers: [SubscriptionsService, SubscriptionMiddleware, PlanLimitsService],
  exports: [SubscriptionsService, SubscriptionMiddleware, PlanLimitsService],
})
export class SubscriptionsModule {}
