import { Controller, Get, Inject, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PublicTenant, TenantContext } from '@ventea/shared';

import { PublicBaseUrl } from '@/common/decorators/public-base-url.decorator';
import { CurrentTenant } from '@/common/tenant.context';
import { absoluteMediaUrl } from '@/modules/media/media-url';
import { StaffRewardsService, toProgram } from '@/modules/rewards/staff-rewards.service';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Datos públicos de la marca del request: nombre, moneda, colores y programa de puntos. */
@ApiTags('tenant')
@Controller('tenant')
export class TenantController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly rewards: StaffRewardsService,
  ) {}

  @Get()
  async get(
    @CurrentTenant() context: TenantContext,
    @PublicBaseUrl() base: string,
  ): Promise<PublicTenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: context.tenantId },
      include: { branding: true, rewardProgram: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const { branding, rewardProgram } = tenant;
    const program = toProgram(rewardProgram);
    return {
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.currency,
      branding: {
        // Defaults del esquema por si la marca todavía no tiene fila de branding.
        primaryColor: branding?.primaryColor ?? '#E23B2E',
        secondaryColor: branding?.secondaryColor ?? '#1F1D1B',
        accentColor: branding?.accentColor ?? null,
        // Absolutas (TASK-016): las usan también la app nativa y el generador de apps.
        logoUrl: absoluteMediaUrl(branding?.logoUrl, base),
        iconUrl: absoluteMediaUrl(branding?.iconUrl, base),
        appDisplayName: branding?.appDisplayName ?? tenant.name,
      },
      rewardProgram: program,
      // Catálogo de recompensas (TASK-023): lo que la app muestra para canjear en el local.
      rewards: await this.rewards.publicCatalog(tenant.id, program.isEnabled),
    };
  }
}
