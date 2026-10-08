import { Body, Controller, Get, Inject, NotFoundException, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
}
