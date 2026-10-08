import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  billingChangePlanSchema,
  paymentMethodInputSchema,
  type BillingChangePlanInput,
  type BillingOverview,
  type PaymentMethodInput,
} from '@ventea/shared';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { CurrentStaff, StaffAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';
import { RateLimit, RateLimitGuard } from '@/modules/platform/rate-limit.guard';

import { BillingService } from './billing.service';

/**
 * Cobro de la suscripción, desde el panel del dueño. Solo `owner`. Abiertas aunque la marca
 * esté suspendida (`SUBSCRIPTION_OPEN_ROUTES`): es justamente cuando hay que pagar.
 */
@ApiTags('billing')
@StaffAuth('owner')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  overview(@CurrentStaff() staff: StaffPrincipal): Promise<BillingOverview> {
    return this.billing.overview(staff.tenantId);
  }

  /** Alta de tarjeta + primer cobro. 5 intentos por marca y hora (anti card-testing). */
  @Post('payment-method')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    bucket: 'billing-payment-method',
    envKey: 'BILLING_RATE_LIMIT_PER_HOUR',
    defaultPerHour: 5,
    key: 'tenant',
  })
  @UseGuards(RateLimitGuard)
  addPaymentMethod(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(paymentMethodInputSchema)) input: PaymentMethodInput,
  ): Promise<BillingOverview> {
    return this.billing.addPaymentMethod(staff.tenantId, input);
  }

  @Post('change-plan')
  @HttpCode(HttpStatus.OK)
  changePlan(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(billingChangePlanSchema)) input: BillingChangePlanInput,
  ): Promise<BillingOverview> {
    return this.billing.changePlan(staff.tenantId, input);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentStaff() staff: StaffPrincipal): Promise<BillingOverview> {
    return this.billing.cancel(staff.tenantId);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  resume(@CurrentStaff() staff: StaffPrincipal): Promise<BillingOverview> {
    return this.billing.resume(staff.tenantId);
  }
}
