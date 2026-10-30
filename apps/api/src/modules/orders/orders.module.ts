import { Module } from '@nestjs/common';

import { PushModule } from '@/modules/push/push.module';
import { RewardsModule } from '@/modules/rewards/rewards.module';

import { StaffOrderSettingsController } from './order-settings.controller';
import { OrderSettingsService } from './order-settings.service';
import { OrdersController, StaffOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [RewardsModule, PushModule],
  controllers: [OrdersController, StaffOrdersController, StaffOrderSettingsController],
  providers: [OrdersService, OrderSettingsService],
})
export class OrdersModule {}
