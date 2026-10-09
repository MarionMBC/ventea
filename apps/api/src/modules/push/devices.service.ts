import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Device, RegisterDeviceInput } from '@ventea/shared';

import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

/** Tope de dispositivos con push por cliente: al pasarlo se descarta el menos usado. */
const MAX_DEVICES_PER_CUSTOMER = 10;

const DEVICE_SELECT = { id: true, platform: true, createdAt: true } as const;

@Injectable()
export class DevicesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClientExtended) {}

  /**
   * Upsert por (marca, token). Si el token ya era de este cliente, lo renueva (`created=false`);
   * si era de otro cliente de la marca (cambio de cuenta en el mismo teléfono), pasa a este:
   * un teléfono recibe los avisos de quien tiene la sesión abierta.
   */
  async register(
    tenantId: string,
    customerId: string,
    input: RegisterDeviceInput,
  ): Promise<{ device: Device; created: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa los registros del mismo token: dos POST simultáneos no crean dos filas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`device:${tenantId}:${input.pushToken}`}))`;
      const existing = await tx.device.findFirst({
        where: { tenantId, pushToken: input.pushToken },
        select: { id: true, customerId: true },
      });

      if (existing) {
        await tx.device.updateMany({
          where: { tenantId, id: existing.id },
          data: { customerId, platform: input.platform, lastSeenAt: new Date() },
        });
        const device = await tx.device.findFirstOrThrow({
          where: { tenantId, id: existing.id },
          select: DEVICE_SELECT,
        });
        return { device, created: existing.customerId !== customerId };
      }

      const device = await tx.device.create({
        data: { tenantId, customerId, platform: input.platform, pushToken: input.pushToken },
        select: DEVICE_SELECT,
      });
      const stale = await tx.device.findMany({
        where: { tenantId, customerId, pushToken: { not: null } },
        orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
        skip: MAX_DEVICES_PER_CUSTOMER,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.device.updateMany({
          where: { tenantId, id: { in: stale.map((d) => d.id) } },
          data: { pushToken: null },
        });
      }
      return { device, created: true };
    });
  }

  /**
   * Baja al cerrar sesión. `404` si no es un dispositivo de este cliente (no se confirma que
   * exista). Si el dispositivo ancla el login biométrico solo se le quita el token.
   */
  async remove(tenantId: string, customerId: string, id: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { tenantId, customerId, id },
      select: { biometricKeyId: true },
    });
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    if (device.biometricKeyId) {
      await this.prisma.device.updateMany({
        where: { tenantId, customerId, id },
        data: { pushToken: null },
      });
    } else {
      await this.prisma.device.deleteMany({ where: { tenantId, customerId, id } });
    }
  }
}
