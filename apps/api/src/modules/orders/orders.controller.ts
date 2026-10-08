import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createOrderSchema,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  staffOrdersQuerySchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type Order,
  type StaffOrder,
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

const IDEMPOTENCY_KEY_PIPE = new ZodValidationPipe(idempotencyKeySchema.optional());

/** Pedidos del cliente autenticado. */
@ApiTags('orders')
@CustomerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * `201` con el pedido nuevo. Con `Idempotency-Key`, un reintento del mismo pedido
   * responde `200` con el pedido original; la misma clave con otro cuerpo, `409`.
   */
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body(new ZodValidationPipe(createOrderSchema)) input: CreateOrderInput,
    @Headers(IDEMPOTENCY_KEY_HEADER) rawIdempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Order> {
    // @Headers() no admite pipes en Nest: se valida acá con el mismo pipe y formato de error.
    const idempotencyKey = IDEMPOTENCY_KEY_PIPE.transform(rawIdempotencyKey, { type: 'custom' });
    const result = await this.orders.create(tenant, customer.customerId, input, idempotencyKey);
    if (!result.created) response.status(HttpStatus.OK);
    return result.order;
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
  ): Promise<StaffOrder[]> {
    return this.orders.listForStaff(staff.tenantId, query);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrderStatusSchema)) input: UpdateOrderStatusInput,
  ): Promise<StaffOrder> {
    return this.orders.updateStatusByStaff(staff.tenantId, id, input.status);
  }
}
