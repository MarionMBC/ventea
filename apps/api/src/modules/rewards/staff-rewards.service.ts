import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  REWARD_CUSTOMERS_PAGE_SIZE,
  type PublicReward,
  type RewardAdjustmentInput,
  type RewardCatalogInput,
  type RewardCatalogItem,
  type RewardCustomer,
  type RewardCustomerDetail,
  type RewardCustomersPage,
  type RewardCustomersQuery,
  type RewardProgram,
  type StaffRewards,
  type UpdateRewardProgramInput,
} from '@ventea/shared';

import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { RewardsService } from './rewards.service';

/** Quién escribe desde el panel: queda en el asiento (auditoría). */
export interface RewardsActor {
  tenantId: string;
  staffId: string;
}

/** Tope del catálogo: una carta de recompensas larga no se lee en la app. */
export const MAX_CATALOG_ITEMS = 50;
/** Asientos que muestra el detalle de un cliente (los más recientes). */
const LEDGER_PAGE = 50;

const CATALOG_SELECT = {
  id: true,
  name: true,
  pointsCost: true,
  kind: true,
  menuItemId: true,
  discountCents: true,
  isActive: true,
  menuItem: { select: { name: true, deletedAt: true } },
} satisfies Prisma.RewardCatalogItemSelect;

type CatalogRow = Prisma.RewardCatalogItemGetPayload<{ select: typeof CATALOG_SELECT }>;

/** Un producto borrado (del todo o soft) deja la recompensa sin nada que entregar. */
function itemAvailable(row: CatalogRow): boolean {
  return row.kind === 'discount' || (row.menuItem !== null && row.menuItem.deletedAt === null);
}

function toCatalogItem(row: CatalogRow): RewardCatalogItem {
  return {
    id: row.id,
    name: row.name,
    pointsCost: row.pointsCost,
    kind: row.kind,
    menuItemId: row.menuItemId,
    discountCents: row.discountCents,
    isActive: row.isActive,
    menuItemName: row.menuItem && row.menuItem.deletedAt === null ? row.menuItem.name : null,
  };
}

/** Programa con los valores por defecto del esquema si la marca todavía no tiene fila. */
export function toProgram(
  row: {
    isEnabled: boolean;
    pointsPerCurrencyUnit: number;
    redemptionValueCents: number;
    minPointsToRedeem: number;
    signupBonusPoints: number;
  } | null,
): RewardProgram {
  return {
    isEnabled: row?.isEnabled ?? false,
    pointsPerCurrencyUnit: row?.pointsPerCurrencyUnit ?? 0,
    redemptionValueCents: row?.redemptionValueCents ?? 0,
    minPointsToRedeem: row?.minPointsToRedeem ?? 0,
    signupBonusPoints: row?.signupBonusPoints ?? 0,
  };
}

/** `%`, `_` y `\` literales en un ILIKE. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

interface CustomerRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  balance: bigint | number | null;
  lifetimeEarned: bigint | number | null;
  lastActivityAt: Date | null;
}

function toCustomer(row: CustomerRow): RewardCustomer {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    balance: Number(row.balance ?? 0),
    lifetimeEarned: Number(row.lifetimeEarned ?? 0),
    lastActivityAt: row.lastActivityAt,
  };
}

/**
 * Programa de puntos desde el panel (TASK-023, solo el dueño). El libro sigue append-only: un
 * ajuste o un canje en el local es un asiento nuevo con el staff que lo hizo y su motivo.
 */
@Injectable()
export class StaffRewardsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly rewards: RewardsService,
  ) {}

  /** Recompensas activas que la app muestra (`GET /api/tenant`). Vacío con el programa apagado. */
  async publicCatalog(tenantId: string, programEnabled: boolean): Promise<PublicReward[]> {
    if (!programEnabled) return [];
    const rows = await this.prisma.rewardCatalogItem.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: CATALOG_SELECT,
    });
    return rows.filter(itemAvailable).map((row) => ({
      id: row.id,
      name: row.name,
      pointsCost: row.pointsCost,
      kind: row.kind,
      menuItemId: row.menuItemId,
      discountCents: row.discountCents,
    }));
  }

  async overview(tenantId: string): Promise<StaffRewards> {
    const [tenant, program, catalog] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
      this.prisma.rewardProgram.findFirst({ where: { tenantId } }),
      this.catalog(tenantId),
    ]);
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return { currency: tenant.currency, program: toProgram(program), catalog };
  }

  async updateProgram(tenantId: string, input: UpdateRewardProgramInput): Promise<StaffRewards> {
    await this.prisma.rewardProgram.upsert({
      where: { tenantId },
      create: { tenantId, ...input },
      update: input,
    });
    return this.overview(tenantId);
  }

  private async catalog(tenantId: string): Promise<RewardCatalogItem[]> {
    const rows = await this.prisma.rewardCatalogItem.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: CATALOG_SELECT,
    });
    return rows.map(toCatalogItem);
  }

  /** El producto de una recompensa tiene que ser de la marca y seguir en el menú. */
  private async catalogData(tenantId: string, input: RewardCatalogInput) {
    if (input.kind === 'item') {
      const item = await this.prisma.menuItem.findFirst({
        where: { tenantId, id: input.menuItemId, deletedAt: null },
        select: { id: true },
      });
      if (!item) throw new BadRequestException('Producto no encontrado en el menú');
    }
    return {
      name: input.name,
      pointsCost: input.pointsCost,
      isActive: input.isActive,
      kind: input.kind,
      menuItemId: input.kind === 'item' ? input.menuItemId : null,
      discountCents: input.kind === 'discount' ? input.discountCents : null,
    };
  }

  async createReward(tenantId: string, input: RewardCatalogInput): Promise<RewardCatalogItem> {
    const data = await this.catalogData(tenantId, input);
    return this.prisma.$transaction(async (tx) => {
      // Serializa las altas de la marca: el tope y el orden no se pisan entre dos pestañas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reward-catalog:${tenantId}`}))`;
      const existing = await tx.rewardCatalogItem.aggregate({
        where: { tenantId },
        _count: { _all: true },
        _max: { sortOrder: true },
      });
      if (existing._count._all >= MAX_CATALOG_ITEMS) {
        throw new ConflictException(`El catálogo admite hasta ${MAX_CATALOG_ITEMS} recompensas`);
      }
      const row = await tx.rewardCatalogItem.create({
        data: { tenantId, ...data, sortOrder: (existing._max.sortOrder ?? -1) + 1 },
        select: CATALOG_SELECT,
      });
      return toCatalogItem(row);
    });
  }

  async updateReward(
    tenantId: string,
    id: string,
    input: RewardCatalogInput,
  ): Promise<RewardCatalogItem> {
    const data = await this.catalogData(tenantId, input);
    const { count } = await this.prisma.rewardCatalogItem.updateMany({
      where: { tenantId, id },
      data,
    });
    if (count === 0) throw new NotFoundException('Recompensa no encontrada');
    const row = await this.prisma.rewardCatalogItem.findFirstOrThrow({
      where: { tenantId, id },
      select: CATALOG_SELECT,
    });
    return toCatalogItem(row);
  }

  /** Borra la recompensa. Los canjes pasados conservan su nombre en el asiento (`note`). */
  async deleteReward(tenantId: string, id: string): Promise<void> {
    const { count } = await this.prisma.rewardCatalogItem.deleteMany({ where: { tenantId, id } });
    if (count === 0) throw new NotFoundException('Recompensa no encontrada');
  }

  // ─── Clientes ──────────────────────────────────────────────────────────────

  /**
   * Clientes con su saldo, del mayor al menor. El saldo es la suma del libro, agrupada en una
   * sola consulta (índice `tenantId, customerId, createdAt`); la búsqueda es por email o nombre.
   */
  async customers(tenantId: string, query: RewardCustomersQuery): Promise<RewardCustomersPage> {
    const pageSize = REWARD_CUSTOMERS_PAGE_SIZE;
    const search = query.q
      ? Prisma.sql`AND (c."email" ILIKE ${likePattern(query.q)}
          OR concat_ws(' ', c."firstName", c."lastName") ILIKE ${likePattern(query.q)})`
      : Prisma.empty;

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<CustomerRow[]>`
        SELECT c."id", c."email", c."firstName", c."lastName",
               COALESCE(l."balance", 0) AS "balance",
               COALESCE(l."earned", 0) AS "lifetimeEarned",
               l."last" AS "lastActivityAt"
        FROM "customers" c
        LEFT JOIN (
          SELECT "customerId",
                 SUM("points") AS "balance",
                 SUM("points") FILTER (WHERE "points" > 0) AS "earned",
                 MAX("createdAt") AS "last"
          FROM "reward_ledger_entries"
          WHERE "tenantId" = ${tenantId}
          GROUP BY "customerId"
        ) l ON l."customerId" = c."id"
        WHERE c."tenantId" = ${tenantId} ${search}
        ORDER BY COALESCE(l."balance", 0) DESC, c."createdAt" DESC, c."id"
        LIMIT ${pageSize} OFFSET ${(query.page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS "total" FROM "customers" c
        WHERE c."tenantId" = ${tenantId} ${search}`,
    ]);

    return {
      items: rows.map(toCustomer),
      total: Number(counted[0]?.total ?? 0),
      page: query.page,
      pageSize,
    };
  }

  async customerDetail(
    tenantId: string,
    customerId: string,
    db: PrismaDb = this.prisma,
  ): Promise<RewardCustomerDetail> {
    const customer = await db.customer.findFirst({
      where: { tenantId, id: customerId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const [totals, entries] = await Promise.all([
      db.$queryRaw<CustomerRow[]>`
        SELECT ${customer.id} AS "id", '' AS "email", NULL AS "firstName", NULL AS "lastName",
               COALESCE(SUM("points"), 0) AS "balance",
               COALESCE(SUM("points") FILTER (WHERE "points" > 0), 0) AS "lifetimeEarned",
               MAX("createdAt") AS "lastActivityAt"
        FROM "reward_ledger_entries"
        WHERE "tenantId" = ${tenantId} AND "customerId" = ${customer.id}`,
      db.rewardLedgerEntry.findMany({
        where: { tenantId, customerId: customer.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: LEDGER_PAGE,
        select: {
          id: true,
          points: true,
          reason: true,
          note: true,
          staffNote: true,
          createdAt: true,
          order: { select: { code: true } },
          staff: { select: { name: true } },
          reward: { select: { name: true } },
        },
      }),
    ]);
    const total = totals[0];

    return {
      customer: {
        ...customer,
        balance: Number(total?.balance ?? 0),
        lifetimeEarned: Number(total?.lifetimeEarned ?? 0),
        lastActivityAt: total?.lastActivityAt ?? null,
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        points: entry.points,
        reason: entry.reason,
        orderCode: entry.order?.code ?? null,
        // Canje en el local: el nombre vivo, o el que quedó en el asiento si se borró.
        rewardName:
          entry.reward?.name ?? (entry.reason === 'redemption' && !entry.order ? entry.note : null),
        staffNote: entry.staffNote,
        staffName: entry.staff?.name ?? null,
        createdAt: entry.createdAt,
      })),
    };
  }

  /**
   * Bloquea la fila del cliente hasta el commit, como el alta de pedidos: un ajuste, un canje
   * y un pedido con puntos del mismo cliente no leen el mismo saldo a la vez.
   */
  private async lockCustomer(tx: PrismaDb, tenantId: string, customerId: string): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "customers"
      WHERE "id" = ${customerId} AND "tenantId" = ${tenantId}
      FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Cliente no encontrado');
  }

  /** Ajuste manual con motivo. Restar más de lo que hay es un 400: el saldo nunca es negativo. */
  async adjust(
    actor: RewardsActor,
    customerId: string,
    input: RewardAdjustmentInput,
  ): Promise<RewardCustomerDetail> {
    const { tenantId, staffId } = actor;
    return this.prisma.$transaction(async (tx) => {
      await this.lockCustomer(tx, tenantId, customerId);
      await this.assertStaff(tx, actor);
      if (input.points < 0) {
        const balance = await this.rewards.balance(tx, tenantId, customerId);
        if (balance + input.points < 0) {
          throw new BadRequestException(
            `El cliente tiene ${balance} puntos: no se pueden restar ${-input.points}`,
          );
        }
      }
      await tx.rewardLedgerEntry.create({
        data: {
          tenantId,
          customerId,
          points: input.points,
          reason: 'manual_adjustment',
          staffId,
          staffNote: input.reason,
        },
      });
      return this.customerDetail(tenantId, customerId, tx);
    });
  }

  /** Canje en el local de una recompensa activa del catálogo. */
  async redeem(
    actor: RewardsActor,
    customerId: string,
    rewardId: string,
  ): Promise<RewardCustomerDetail> {
    const { tenantId, staffId } = actor;
    return this.prisma.$transaction(async (tx) => {
      await this.lockCustomer(tx, tenantId, customerId);
      await this.assertStaff(tx, actor);
      const program = await this.rewards.program(tx, tenantId);
      if (!program?.isEnabled) throw new BadRequestException('El programa de puntos está apagado');

      const reward = await tx.rewardCatalogItem.findFirst({
        where: { tenantId, id: rewardId, isActive: true },
        select: CATALOG_SELECT,
      });
      if (!reward) throw new NotFoundException('Recompensa no disponible');
      if (!itemAvailable(reward)) {
        throw new BadRequestException('El producto de esta recompensa ya no está en el menú');
      }

      const balance = await this.rewards.balance(tx, tenantId, customerId);
      if (balance < reward.pointsCost) {
        throw new BadRequestException(
          `Saldo insuficiente: tiene ${balance} puntos y la recompensa cuesta ${reward.pointsCost}`,
        );
      }
      await tx.rewardLedgerEntry.create({
        data: {
          tenantId,
          customerId,
          points: -reward.pointsCost,
          reason: 'redemption',
          rewardId: reward.id,
          staffId,
          // El nombre queda en el asiento: sobrevive a que la recompensa se edite o se borre.
          note: reward.name,
        },
      });
      return this.customerDetail(tenantId, customerId, tx);
    });
  }

  /** El staff del token sigue existiendo y activo: su id va a la auditoría (FK). */
  private async assertStaff(tx: PrismaDb, actor: RewardsActor): Promise<void> {
    const staff = await tx.staffMember.findFirst({
      where: { tenantId: actor.tenantId, id: actor.staffId, isActive: true },
      select: { id: true },
    });
    if (!staff) throw new UnauthorizedException('Sesión inválida o expirada');
  }
}
