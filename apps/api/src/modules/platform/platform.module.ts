import { Module } from '@nestjs/common';

import { PlatformAuthGuard } from '@/common/guards/platform-auth.guard';
import { BillingModule } from '@/modules/billing/billing.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

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

/**
 * Plataforma SaaS (ADR 0007): registro self-service, planes y administración de las
 * marcas. Sus rutas (`/api/platform/*`) quedan fuera del TenantMiddleware.
 */
@Module({
  imports: [SubscriptionsModule, BillingModule],
  controllers: [
    PlatformPublicController,
    PlatformAuthController,
    PlatformTenantsController,
    PlatformBillingController,
  ],
  providers: [
    RegionService,
    SignupService,
    PlatformAuthService,
    PlatformTenantsService,
    PlatformAuthGuard,
    RateLimitStore,
    RateLimitGuard,
  ],
})
export class PlatformModule {}
