import { Module } from '@nestjs/common';

import { RewardsModule } from '@/modules/rewards/rewards.module';

import { OrdersController, StaffOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [RewardsModule],
  controllers: [OrdersController, StaffOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
