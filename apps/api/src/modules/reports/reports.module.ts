import { Module } from '@nestjs/common';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Reportes de ventas del panel (`/api/staff/reports/*`, TASK-023). */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
