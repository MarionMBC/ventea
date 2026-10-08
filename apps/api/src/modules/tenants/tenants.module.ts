import { Module } from '@nestjs/common';

import { TenantController } from './tenant.controller';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  controllers: [TenantController],
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantsModule {}
