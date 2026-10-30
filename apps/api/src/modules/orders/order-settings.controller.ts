import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { orderSettingsSchema, type OrderSettings } from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { OrderSettingsService } from './order-settings.service';

/** Ajustes de pedidos desde el panel. Solo el dueño: decide qué puede hacer el cliente. */
@ApiTags('staff-order-settings')
@StaffAuth('owner')
@Controller('staff/order-settings')
export class StaffOrderSettingsController {
  constructor(private readonly settings: OrderSettingsService) {}

  @Get()
  get(@CurrentStaff() staff: StaffPrincipal): Promise<OrderSettings> {
    return this.settings.get(staff.tenantId);
  }

  @Put()
  update(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(orderSettingsSchema)) input: OrderSettings,
  ): Promise<OrderSettings> {
    return this.settings.update(staff.tenantId, input);
  }
}
