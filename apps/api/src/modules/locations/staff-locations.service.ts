import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  openingHoursSchema,
  type CreateLocationInput,
  type StaffLocation,
  type StaffLocations,
  type UpdateLocationInput,
} from '@ventea/shared';

import { PlanLimitsService } from '@/modules/subscriptions/plan-limits.service';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { isForeignKeyViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

const LOCATION_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  latitude: true,
  longitude: true,
  openingHours: true,
  isActive: true,
  acceptsOrders: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { orders: true } },
} as const;

type LocationRow = Prisma.LocationGetPayload<{ select: typeof LOCATION_SELECT }>;

const LAST_ACTIVE =
  'La marca necesita al menos una sucursal activa: la app muestra el menú de una de ellas';

/**
 * Sucursales desde el panel (TASK-022). Cada escritura corre en una transacción con un
 * advisory lock por marca: dos altas simultáneas no pueden pasar juntas el tope del plan, ni
 * dos desactivaciones dejar la marca sin sucursal activa.
 */
@Injectable()
export class StaffLocationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly limits: PlanLimitsService,
  ) {}

  async list(tenantId: string): Promise<StaffLocations> {
    const [rows, usage] = await Promise.all([
      this.prisma.location.findMany({
        where: { tenantId },
        select: LOCATION_SELECT,
        orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      }),
      this.limits.locationUsage(tenantId),
    ]);
    return { locations: rows.map(toStaffLocation), usage };
  }

  async create(tenantId: string, input: CreateLocationInput): Promise<StaffLocation> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, tenantId);
      if (input.isActive) await this.limits.assertCanAddLocation(tenantId, tx);
      const row = await tx.location.create({
        data: { tenantId, ...input },
        select: LOCATION_SELECT,
      });
      return toStaffLocation(row);
    });
  }

  async update(tenantId: string, id: string, input: UpdateLocationInput): Promise<StaffLocation> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, tenantId);
      const current = await this.find(tx, tenantId, id);
      if (input.isActive === true && !current.isActive) {
        await this.limits.assertCanAddLocation(tenantId, tx);
      }
      if (input.isActive === false && current.isActive) {
        await assertAnotherActive(tx, tenantId, id);
      }
      // `updateMany` con tenantId: el guard de Prisma lo exige y el id ya se verificó arriba.
      await tx.location.updateMany({ where: { tenantId, id }, data: input });
      return toStaffLocation(await this.find(tx, tenantId, id));
    });
  }

  /** Borra una sucursal sin pedidos. Con pedidos (FK Restrict) se desactiva, no se borra. */
  async remove(tenantId: string, id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await lock(tx, tenantId);
        const current = await this.find(tx, tenantId, id);
        if (current._count.orders > 0) {
          throw new ConflictException(
            'La sucursal tiene pedidos: desactívela en lugar de borrarla',
          );
        }
        if (current.isActive) await assertAnotherActive(tx, tenantId, id);
        await tx.location.deleteMany({ where: { tenantId, id } });
      });
    } catch (error) {
      // Un pedido creado entre la verificación y el borrado.
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('La sucursal tiene pedidos: desactívela en lugar de borrarla');
      }
      throw error;
    }
  }

  private async find(db: PrismaDb, tenantId: string, id: string): Promise<LocationRow> {
    const row = await db.location.findFirst({ where: { tenantId, id }, select: LOCATION_SELECT });
    // Otra marca o inexistente: el mismo 404 (no se confirma que el id exista en otra marca).
    if (!row) throw new NotFoundException('Sucursal no encontrada');
    return row;
  }
}

async function lock(tx: PrismaDb, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locations:${tenantId}`}))`;
}

async function assertAnotherActive(tx: PrismaDb, tenantId: string, id: string): Promise<void> {
  const others = await tx.location.count({
    where: { tenantId, isActive: true, id: { not: id } },
  });
  if (others === 0) throw new ConflictException(LAST_ACTIVE);
}

function toStaffLocation(row: LocationRow): StaffLocation {
  // El JSON se escribía a mano antes del panel: si no tiene la forma esperada, sin horario.
  const hours = openingHoursSchema.safeParse(row.openingHours);
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    openingHours: hours.success ? hours.data : [],
    isActive: row.isActive,
    acceptsOrders: row.acceptsOrders,
    hasOrders: row._count.orders > 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
