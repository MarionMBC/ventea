import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { salesReportQuerySchema, type SalesReport, type SalesReportQuery } from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { ReportsService } from './reports.service';

/** Reportes de ventas (TASK-023): dueño y gerente, si el plan los incluye. */
@ApiTags('staff-reports')
@StaffAuth('owner', 'manager')
@Controller('staff/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  sales(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodValidationPipe(salesReportQuerySchema)) query: SalesReportQuery,
  ): Promise<SalesReport> {
    return this.reports.sales(staff.tenantId, query);
  }
}
