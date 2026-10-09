import { Module } from '@nestjs/common';

import { RateLimitGuard, RateLimitStore } from '@/modules/platform/rate-limit.guard';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

import { StaffTeamController, StaffTeamLinksController } from './team.controller';
import { TeamService } from './team.service';

/** Equipo de la marca desde el panel y enlaces de invitación / contraseña nueva (TASK-022). */
@Module({
  imports: [SubscriptionsModule],
  controllers: [StaffTeamController, StaffTeamLinksController],
  providers: [TeamService, RateLimitStore, RateLimitGuard],
})
export class TeamModule {}
