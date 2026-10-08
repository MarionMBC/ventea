import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  type AuthTokens,
  type CustomerAuthResponse,
  type LoginInput,
  type RefreshTokenInput,
  type RegisterInput,
  type StaffAuthResponse,
  type TenantContext,
} from '@ventea/shared';

import { CurrentTenant } from '@/common/tenant.context';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { AuthService } from './auth.service';

/** Auth de clientes de la app. Todo acotado al tenant del request. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
  ): Promise<CustomerAuthResponse> {
    return this.auth.register(tenant, input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
  ): Promise<CustomerAuthResponse> {
    return this.auth.login(tenant, input);
  }

  /** Sirve para sesiones de cliente y de staff: el `kind` sale del propio token. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(refreshTokenSchema)) input: RefreshTokenInput,
  ): Promise<AuthTokens> {
    return this.auth.refresh(tenant, input.refreshToken);
  }
}

/** Login del staff de la marca (panel). */
@ApiTags('auth')
@Controller('staff/auth')
export class StaffAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
  ): Promise<StaffAuthResponse> {
    return this.auth.staffLogin(tenant, input);
  }
}
