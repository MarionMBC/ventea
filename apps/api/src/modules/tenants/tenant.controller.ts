import { Controller, Get, Inject, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PublicTenant, TenantContext } from '@ventea/shared';

import { CurrentTenant } from '@/common/tenant.context';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Datos públicos de la marca del request: nombre, moneda, colores y programa de puntos. */
@ApiTags('tenant')
@Controller('tenant')
export class TenantController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  @Get()
  async get(@CurrentTenant() context: TenantContext): Promise<PublicTenant> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: context.tenantId },
      include: { branding: true, rewardProgram: true },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const { branding, rewardProgram } = tenant;
    return {
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.currency,
      branding: {
        // Defaults del esquema por si la marca todavía no tiene fila de branding.
        primaryColor: branding?.primaryColor ?? '#E23B2E',
        secondaryColor: branding?.secondaryColor ?? '#1F1D1B',
        logoUrl: branding?.logoUrl ?? null,
        appDisplayName: branding?.appDisplayName ?? tenant.name,
      },
      rewardProgram: {
        isEnabled: rewardProgram?.isEnabled ?? false,
        pointsPerCurrencyUnit: rewardProgram?.pointsPerCurrencyUnit ?? 0,
        redemptionValueCents: rewardProgram?.redemptionValueCents ?? 0,
        minPointsToRedeem: rewardProgram?.minPointsToRedeem ?? 0,
        signupBonusPoints: rewardProgram?.signupBonusPoints ?? 0,
      },
    };
  }
}
