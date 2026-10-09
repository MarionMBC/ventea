import { Module } from '@nestjs/common';

import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { StaffRewardsController } from './staff-rewards.controller';
import { StaffRewardsService } from './staff-rewards.service';

@Module({
  controllers: [RewardsController, StaffRewardsController],
  providers: [RewardsService, StaffRewardsService],
  exports: [RewardsService, StaffRewardsService],
})
export class RewardsModule {}
