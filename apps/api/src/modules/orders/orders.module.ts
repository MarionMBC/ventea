import { Module } from '@nestjs/common';

import { PushModule } from '@/modules/push/push.module';
import { RewardsModule } from '@/modules/rewards/rewards.module';

import { OrdersController, StaffOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [RewardsModule, PushModule],
  controllers: [OrdersController, StaffOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
