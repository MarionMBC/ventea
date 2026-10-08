import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createOrderSchema,
  staffOrdersQuerySchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type Order,
  type StaffOrdersQuery,
  type TenantContext,
  type UpdateOrderStatusInput,
} from '@ventea/shared';

import type { CustomerPrincipal, StaffPrincipal } from '@/common/auth/auth.context';
import {
  CurrentCustomer,
  CurrentStaff,
  CustomerAuth,
  StaffAuth,
} from '@/common/decorators/auth.decorators';
import { CurrentTenant } from '@/common/tenant.context';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { OrdersService } from './orders.service';

/** Pedidos del cliente autenticado. */
@ApiTags('orders')
@CustomerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body(new ZodValidationPipe(createOrderSchema)) input: CreateOrderInput,
  ): Promise<Order> {
    return this.orders.create(tenant, customer.customerId, input);
  }

  @Get()
  list(@CurrentCustomer() customer: CustomerPrincipal): Promise<Order[]> {
    return this.orders.listForCustomer(customer.tenantId, customer.customerId);
  }

  @Get(':id')
  get(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string): Promise<Order> {
    return this.orders.getForCustomer(customer.tenantId, customer.customerId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string): Promise<Order> {
    return this.orders.cancelByCustomer(customer.tenantId, customer.customerId, id);
  }
}

/** Pedidos del tenant vistos desde el panel de staff. */
@ApiTags('orders')
@StaffAuth()
@Controller('staff/orders')
export class StaffOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentStaff() staff: StaffPrincipal,
    @Query(new ZodValidationPipe(staffOrdersQuerySchema)) query: StaffOrdersQuery,
  ): Promise<Order[]> {
    return this.orders.listForStaff(staff.tenantId, query.status);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrderStatusSchema)) input: UpdateOrderStatusInput,
  ): Promise<Order> {
    return this.orders.updateStatusByStaff(staff.tenantId, id, input.status);
  }
}
