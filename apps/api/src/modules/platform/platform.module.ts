import { Module } from '@nestjs/common';

import { PlatformAuthGuard } from '@/common/guards/platform-auth.guard';
import { BillingModule } from '@/modules/billing/billing.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

import { PlatformAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import {
  PlatformAuthController,
  PlatformBillingController,
  PlatformPublicController,
  PlatformTenantsController,
} from './platform.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { RateLimitGuard, RateLimitStore } from './rate-limit.guard';
import { RegionService } from './region.service';
import { SignupService } from './signup.service';
import { TenantReadyService } from './tenant-ready.service';

/**
 * Plataforma SaaS (ADR 0007): registro self-service, planes, administración de las
 * marcas y embudo de registro de la landing. Sus rutas (`/api/platform/*`) quedan fuera del TenantMiddleware.
 */
@Module({
  imports: [SubscriptionsModule, BillingModule, NotificationsModule],
  controllers: [
    PlatformPublicController,
    PlatformAuthController,
    PlatformTenantsController,
    PlatformBillingController,
    PlatformAnalyticsController,
  ],
  providers: [
    RegionService,
    SignupService,
    TenantReadyService,
    AnalyticsService,
    PlatformAuthService,
    PlatformTenantsService,
    PlatformAuthGuard,
    RateLimitStore,
    RateLimitGuard,
  ],
})
export class PlatformModule {}
