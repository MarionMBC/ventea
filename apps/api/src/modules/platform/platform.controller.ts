import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  billingSummarySchema,
  changePlanSchema,
  countryCodeSchema,
  extendTrialSchema,
  loginSchema,
  platformTenantListQuerySchema,
  recordPaymentSchema,
  resolvePaymentSchema,
  signupSchema,
  slugAvailabilityQuerySchema,
  suspendTenantSchema,
  tenantReadyQuerySchema,
  type BillingSummary,
  type ChangePlanInput,
  type ExtendTrialInput,
  type LoginInput,
  type Plan,
  type PlatformAuthResponse,
  type PlatformTenantDetail,
  type PlatformTenantListQuery,
  type PlatformTenantPage,
  type RecordPaymentInput,
  type ResolvePaymentInput,
  type SignupInput,
  type SignupResponse,
  type SlugAvailability,
  type SuspendTenantInput,
  type TenantReady,
} from '@ventea/shared';

import type { PlatformPrincipal } from '@/common/auth/auth.context';
import { CurrentPlatformAdmin, PlatformAuth } from '@/common/decorators/auth.decorators';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';
import { PlatformBillingService } from '@/modules/billing/platform-billing.service';

import { PlatformAuthService } from './platform-auth.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';
import { SignupService } from './signup.service';
import { TenantReadyService } from './tenant-ready.service';

/**
 * Rutas públicas de la plataforma (landing y registro). Fuera del TenantMiddleware:
 * no llevan header ni subdominio de marca.
 */
@ApiTags('platform')
@Controller('platform')
export class PlatformPublicController {
  constructor(
    private readonly signups: SignupService,
    private readonly tenantReady: TenantReadyService,
  ) {}

  @Get('plans')
  plans(): Promise<Plan[]> {
    return this.signups.listPlans();
  }

  @Get('slug-available')
  slugAvailable(
    @Query(new ZodValidationPipe(slugAvailabilityQuerySchema)) query: { slug: string },
  ): Promise<SlugAvailability> {
    return this.signups.slugAvailability(query.slug);
  }

  /**
   * ¿`https://<slug>.<dominio>` ya responde con un certificado válido? La pantalla de éxito del
   * registro lo consulta cada 5 s antes de habilitar «Entrar a mi panel». 404 si no existe.
   */
  @Get('tenant-ready')
  @RateLimit({
    bucket: 'tenant-ready',
    envKey: 'TENANT_READY_RATE_LIMIT_PER_HOUR',
    defaultPerHour: 240,
  })
  @UseGuards(RateLimitGuard)
  async tenantReadyCheck(
    @Query(new ZodValidationPipe(tenantReadyQuerySchema)) query: { slug: string },
  ): Promise<TenantReady> {
    return { ready: await this.tenantReady.isReady(query.slug) };
  }

  @Post('signup')
  @RateLimit({ bucket: 'signup', envKey: 'SIGNUP_RATE_LIMIT_PER_HOUR', defaultPerHour: 5 })
  @UseGuards(RateLimitGuard)
  signup(
    @Body(new ZodValidationPipe(signupSchema)) input: SignupInput,
    @Headers('cf-ipcountry') cfCountry?: string,
    @Headers('x-country') xCountry?: string,
  ): Promise<SignupResponse> {
    // El header lo pone el proxy; si no tiene forma de país, se ignora (no es un 400:
    // el usuario no lo controla).
    const header = countryCodeSchema.safeParse(cfCountry ?? xCountry);
    return this.signups.signup(input, header.success ? header.data : undefined);
  }
}

/** Login de los administradores de la plataforma. */
@ApiTags('platform')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    bucket: 'platform-login',
    envKey: 'PLATFORM_LOGIN_RATE_LIMIT_PER_HOUR',
    defaultPerHour: 20,
  })
  @UseGuards(RateLimitGuard)
  login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
  ): Promise<PlatformAuthResponse> {
    return this.auth.login(input);
  }
}

/** Administración de las marcas. Solo tokens `kind: "platform"`. */
@ApiTags('platform')
@PlatformAuth()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly billing: PlatformBillingService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(platformTenantListQuerySchema)) query: PlatformTenantListQuery,
  ): Promise<PlatformTenantPage> {
    return this.tenants.list(query);
  }

  @Get(':slug')
  detail(@Param('slug') slug: string): Promise<PlatformTenantDetail> {
    return this.tenants.detail(slug);
  }

  @Post(':slug/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(suspendTenantSchema)) input: SuspendTenantInput,
  ): Promise<PlatformTenantDetail> {
    return this.tenants.suspend(slug, admin, input.reason);
  }

  @Post(':slug/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ): Promise<PlatformTenantDetail> {
    return this.tenants.reactivate(slug, admin);
  }

  @Post(':slug/change-plan')
  @HttpCode(HttpStatus.OK)
  changePlan(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(changePlanSchema)) input: ChangePlanInput,
  ): Promise<PlatformTenantDetail> {
    return this.tenants.changePlan(slug, admin, input);
  }

  @Post(':slug/extend-trial')
  @HttpCode(HttpStatus.OK)
  extendTrial(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(extendTrialSchema)) input: ExtendTrialInput,
  ): Promise<PlatformTenantDetail> {
    return this.tenants.extendTrial(slug, admin, input.days);
  }

  /** Pago recibido por fuera (modo manual o transferencia): abre un período nuevo. */
  @Post(':slug/record-payment')
  @HttpCode(HttpStatus.OK)
  async recordPayment(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(recordPaymentSchema)) input: RecordPaymentInput,
  ): Promise<PlatformTenantDetail> {
    await this.billing.recordPayment(slug, admin, input);
    return this.tenants.detail(slug);
  }

  /** Cierra a mano un cobro que la pasarela no pudo confirmar. */
  @Post(':slug/resolve-payment')
  @HttpCode(HttpStatus.OK)
  async resolvePayment(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(resolvePaymentSchema)) input: ResolvePaymentInput,
  ): Promise<PlatformTenantDetail> {
    await this.billing.resolvePayment(slug, admin, input);
    return this.tenants.detail(slug);
  }
}

/** Facturación del SaaS. Solo tokens `kind: "platform"`. */
@ApiTags('platform')
@PlatformAuth()
@Controller('platform/billing')
export class PlatformBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Get('summary')
  async summary(): Promise<BillingSummary> {
    return billingSummarySchema.parse(await this.billing.summary());
  }
}
