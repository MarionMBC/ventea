import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  menuQuerySchema,
  type MenuQuery,
  type PublicMenu,
  type TenantContext,
} from '@ventea/shared';

import { PublicBaseUrl } from '@/common/decorators/public-base-url.decorator';
import { CurrentTenant } from '@/common/tenant.context';
import { ZodValidationPipe } from '@/common/zod-validation.pipe';

import { MenuService } from './menu.service';

/** Menú público: exige tenant, no sesión. */
@ApiTags('catalog')
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  get(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(menuQuerySchema)) query: MenuQuery,
    @PublicBaseUrl() base: string,
  ): Promise<PublicMenu> {
    return this.menu.publicMenu(tenant.tenantId, query.locationId, base);
  }
}
