import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { registerDeviceSchema, type Device, type RegisterDeviceInput } from '@ventea/shared';
import type { Response } from 'express';

import type { CustomerPrincipal } from '@/common/auth/auth.context';
import { CurrentCustomer, CustomerAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { DevicesService } from './devices.service';

/** Dispositivos del cliente para push (TASK-016). */
@ApiTags('push')
@CustomerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** `201` con el dispositivo nuevo (o recién pasado a este cliente); `200` si ya era suyo. */
  @Post()
  async register(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body(new ZodValidationPipe(registerDeviceSchema)) input: RegisterDeviceInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Device> {
    const result = await this.devices.register(customer.tenantId, customer.customerId, input);
    if (!result.created) response.status(HttpStatus.OK);
    return result.device;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.devices.remove(customer.tenantId, customer.customerId, id);
  }
}
