import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { openingHoursSchema, type Location, type TenantContext } from '@ventea/shared';

import { CurrentTenant } from '@/common/tenant.context';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Sucursales activas de la marca. Público: la app las muestra antes del login. */
@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<Location[]> {
    const locations = await this.prisma.location.findMany({
      where: { tenantId: tenant.tenantId, isActive: true },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });

    return locations.map((location) => {
      // El JSON se escribe a mano en operación: si no tiene la forma esperada se omite
      // en vez de mandarle a la app algo que no sabe pintar.
      const hours = openingHoursSchema.safeParse(location.openingHours);
      return {
        id: location.id,
        name: location.name,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        phone: location.phone,
        openingHours: hours.success ? hours.data : null,
        acceptsOrders: location.acceptsOrders,
      };
    });
  }
}
