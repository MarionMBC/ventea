import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  appRequestsQuerySchema,
  pushCredentialsInputSchema,
  updateBrandSchema,
  updatePlatformAppSchema,
  type AppRequestQueueItem,
  type AppRequestsQuery,
  type Brand,
  type BuildConfig,
  type PlatformApp,
  type PushCredentialsInput,
  type PushStatus,
  type UpdateBrandInput,
  type UpdatePlatformAppInput,
} from '@ventea/shared';

import type { PlatformPrincipal, StaffPrincipal } from '@/common/auth/auth.context';
import {
  CurrentPlatformAdmin,
  CurrentStaff,
  PlatformAuth,
  StaffAuth,
} from '@/common/decorators/auth.decorators';
import { PublicBaseUrl } from '@/common/decorators/public-base-url.decorator';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { BrandService } from './brand.service';
import { PlatformAppService } from './platform-app.service';

/** Mi marca: solo el dueño (TASK-016). */
@ApiTags('brand')
@StaffAuth('owner')
@Controller('staff/brand')
export class StaffBrandController {
  constructor(private readonly brand: BrandService) {}

  @Get()
  get(@CurrentStaff() staff: StaffPrincipal, @PublicBaseUrl() base: string): Promise<Brand> {
    return this.brand.get(staff.tenantId, base);
  }

  @Patch()
  update(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodValidationPipe(updateBrandSchema)) input: UpdateBrandInput,
    @PublicBaseUrl() base: string,
  ): Promise<Brand> {
    return this.brand.update(staff.tenantId, input, base);
  }

  /** `201` con la marca y su app en `requested`; `403` sin plan Pro/Cadena; `409` si ya la pidió. */
  @Post('app-request')
  requestApp(@CurrentStaff() staff: StaffPrincipal, @PublicBaseUrl() base: string): Promise<Brand> {
    return this.brand.requestApp(staff.tenantId, staff.staffId, base);
  }
}

/** Cola de apps por marca. Solo plataforma. */
@ApiTags('platform')
@PlatformAuth()
@Controller('platform/app-requests')
export class PlatformAppRequestsController {
  constructor(private readonly apps: PlatformAppService) {}

  @Get()
  queue(
    @Query(new ZodValidationPipe(appRequestsQuerySchema)) query: AppRequestsQuery,
  ): Promise<AppRequestQueueItem[]> {
    return this.apps.queue(query);
  }
}

/** App de una marca y sus credenciales push. Solo plataforma. */
@ApiTags('platform')
@PlatformAuth()
@Controller('platform/tenants/:slug')
export class PlatformTenantAppController {
  constructor(private readonly apps: PlatformAppService) {}

  @Get('app')
  detail(@Param('slug') slug: string): Promise<PlatformApp> {
    return this.apps.detail(slug);
  }

  @Patch('app')
  update(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(updatePlatformAppSchema)) input: UpdatePlatformAppInput,
  ): Promise<PlatformApp> {
    return this.apps.update(slug, admin, input);
  }

  /** Lo consume el generador de apps (TASK-019): branding, AppConfig y URLs absolutas. */
  @Get('app/build-config')
  buildConfig(@Param('slug') slug: string, @PublicBaseUrl() base: string): Promise<BuildConfig> {
    return this.apps.buildConfig(slug, base);
  }

  /** JSON de la service account de Firebase. Se guarda cifrado; nunca se devuelve. */
  @Put('push-credentials')
  setPushCredentials(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
    @Body(new ZodValidationPipe(pushCredentialsInputSchema)) input: PushCredentialsInput,
  ): Promise<PushStatus> {
    return this.apps.setPushCredentials(slug, admin, input);
  }

  @Delete('push-credentials')
  clearPushCredentials(
    @Param('slug') slug: string,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ): Promise<PushStatus> {
    return this.apps.clearPushCredentials(slug, admin);
  }
}
