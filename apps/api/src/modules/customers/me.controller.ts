import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { OrderStatus } from '@prisma/client';
import { updateProfileSchema, type Customer, type UpdateProfileInput } from '@ventea/shared';

import type { CustomerPrincipal } from '@/common/auth/auth.context';
import { CurrentCustomer, CustomerAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { CUSTOMER_SELECT, toCustomer } from './customer.mapper';

@ApiTags('customers')
@CustomerAuth()
@Controller('me')
export class MeController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  @Get()
  async me(@CurrentCustomer() session: CustomerPrincipal): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId: session.tenantId, id: session.customerId },
      select: CUSTOMER_SELECT,
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return toCustomer(customer);
  }

  @Patch()
  async update(
    @CurrentCustomer() session: CustomerPrincipal,
    @Body(new ZodValidationPipe(updateProfileSchema)) input: UpdateProfileInput,
  ): Promise<Customer> {
    // updateMany para que el filtro por tenant vaya en el where (el guard de Prisma lo exige).
    const { count } = await this.prisma.customer.updateMany({
      where: { tenantId: session.tenantId, id: session.customerId },
      data: input,
    });
    if (count === 0) throw new NotFoundException('Cliente no encontrado');
    return this.me(session);
  }

  /**
   * Borrado de cuenta (App Store 5.1.1(v), Play «borrado de cuenta»). Borra al cliente con sus
   * dispositivos y su historial de puntos (cascada); los pedidos quedan sin cliente (SetNull)
   * para la contabilidad del restaurante. Con un pedido en curso no se borra: el local todavía
   * tiene que entregarlo y avisarle.
   */
  @Delete()
  @HttpCode(204)
  async remove(@CurrentCustomer() session: CustomerPrincipal): Promise<void> {
    const active = await this.prisma.order.count({
      where: {
        tenantId: session.tenantId,
        customerId: session.customerId,
        status: { in: ACTIVE_ORDER_STATUSES },
      },
    });
    if (active > 0) {
      throw new ConflictException(
        'Tienes un pedido en curso: podrás borrar la cuenta cuando se complete o se cancele',
      );
    }
    const { count } = await this.prisma.customer.deleteMany({
      where: { tenantId: session.tenantId, id: session.customerId },
    });
    if (count === 0) throw new NotFoundException('Cliente no encontrado');
  }
}

/** Pedidos que el local todavía tiene que cobrar o entregar. */
const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending_payment', 'confirmed', 'preparing', 'ready'];
