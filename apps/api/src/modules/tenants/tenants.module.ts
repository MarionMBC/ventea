import { Module } from '@nestjs/common';

import { RewardsModule } from '@/modules/rewards/rewards.module';

import { TenantController } from './tenant.controller';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  imports: [RewardsModule],
  controllers: [TenantController],
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantsModule {}
