import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

import { LocationsController } from './locations.controller';
import { StaffLocationsController } from './staff-locations.controller';
import { StaffLocationsService } from './staff-locations.service';

/** Sucursales: lista pública de la app y gestión desde el panel (TASK-022). */
@Module({
  imports: [SubscriptionsModule],
  controllers: [LocationsController, StaffLocationsController],
  providers: [StaffLocationsService],
})
export class LocationsModule {}
