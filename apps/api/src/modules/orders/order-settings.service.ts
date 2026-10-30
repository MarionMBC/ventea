import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderSettings } from '@ventea/shared';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Ajustes de pedidos de la marca: hoy, la cancelación por el cliente. */
@Injectable()
export class OrderSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  async get(tenantId: string): Promise<OrderSettings> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { customerCanCancel: true, cancelWindowMinutes: true },
    });
    if (!tenant) throw new NotFoundException('Marca no encontrada');
    return { enabled: tenant.customerCanCancel, windowMinutes: tenant.cancelWindowMinutes };
  }

  async update(tenantId: string, input: OrderSettings): Promise<OrderSettings> {
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { customerCanCancel: input.enabled, cancelWindowMinutes: input.windowMinutes },
      select: { customerCanCancel: true, cancelWindowMinutes: true },
    });
    return { enabled: tenant.customerCanCancel, windowMinutes: tenant.cancelWindowMinutes };
  }
}
