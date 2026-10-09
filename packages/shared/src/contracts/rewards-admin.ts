import { z } from 'zod';

import { REWARD_CATALOG_KIND, REWARD_LEDGER_REASON } from '../domain/enums.js';
import { rewardProgramSchema } from './rewards.js';

/**
 * Programa de puntos desde el panel (TASK-023, `/api/staff/rewards/*`, solo el dueño):
 * reglas del programa, catálogo de recompensas, clientes con su saldo y ajustes auditados.
 */

/** Topes: un dato fuera de rango es un error de tipeo, no una regla de negocio. */
export const REWARDS_MAX_POINTS = 10_000_000;
export const REWARDS_MAX_CENTS = 100_000_000;
export const REWARD_ADJUSTMENT_MAX = 1_000_000;

/** Puntos por unidad de moneda: hasta 2 decimales (0.5 = un punto cada 2 unidades). */
const pointsPerUnitSchema = z
  .number()
  .min(0)
  .max(1000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Hasta 2 decimales');

/** `PUT /api/staff/rewards/program`: reemplaza las reglas completas. */
export const updateRewardProgramSchema = z.strictObject({
  isEnabled: z.boolean(),
  pointsPerCurrencyUnit: pointsPerUnitSchema,
  redemptionValueCents: z.number().int().min(0).max(REWARDS_MAX_CENTS),
  minPointsToRedeem: z.number().int().min(0).max(REWARDS_MAX_POINTS),
  signupBonusPoints: z.number().int().min(0).max(REWARDS_MAX_POINTS),
});

// ─── Catálogo ────────────────────────────────────────────────────────────────

const rewardBase = {
  name: z.string().trim().min(1, 'Nombre requerido').max(60),
  pointsCost: z.number().int().min(1).max(REWARDS_MAX_POINTS),
  isActive: z.boolean().default(true),
};

/** Alta o edición (PUT, cuerpo completo) de una recompensa: un producto o un descuento fijo. */
export const rewardCatalogInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...rewardBase,
    kind: z.literal('item'),
    menuItemId: z.string().uuid(),
  }),
  z.strictObject({
    ...rewardBase,
    kind: z.literal('discount'),
    discountCents: z.number().int().min(1).max(REWARDS_MAX_CENTS),
  }),
]);

/** Recompensa como la ve la app (`GET /api/tenant`, solo activas). */
export const publicRewardSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  pointsCost: z.number().int().positive(),
  kind: z.enum(REWARD_CATALOG_KIND),
  menuItemId: z.string().uuid().nullable(),
  discountCents: z.number().int().positive().nullable(),
});

/** Recompensa en el panel: además, si está activa y el nombre del producto (si sigue existiendo). */
export const rewardCatalogItemSchema = publicRewardSchema.extend({
  isActive: z.boolean(),
  /** Null si el producto se borró (la recompensa queda pero ya no se puede canjear). */
  menuItemName: z.string().nullable(),
});

export const staffRewardsSchema = z.object({
  currency: z.string().length(3),
  program: rewardProgramSchema,
  catalog: z.array(rewardCatalogItemSchema),
});

// ─── Clientes y libro ────────────────────────────────────────────────────────

export const REWARD_CUSTOMERS_PAGE_SIZE = 20;

export const rewardCustomersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const rewardCustomerSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  balance: z.number().int(),
  lifetimeEarned: z.number().int().nonnegative(),
  lastActivityAt: z.coerce.date().nullable(),
});

export const rewardCustomersPageSchema = z.object({
  items: z.array(rewardCustomerSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

/** Asiento del libro con su auditoría: quién lo hizo y por qué (solo panel). */
export const staffLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  points: z.number().int(),
  reason: z.enum(REWARD_LEDGER_REASON),
  orderCode: z.string().nullable(),
  rewardName: z.string().nullable(),
  /** Motivo escrito por el staff (ajustes). */
  staffNote: z.string().nullable(),
  /** Null en asientos automáticos o si la persona ya no existe. */
  staffName: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const rewardCustomerDetailSchema = z.object({
  customer: rewardCustomerSchema,
  entries: z.array(staffLedgerEntrySchema),
});

/** Ajuste manual: suma o resta puntos con un motivo que queda en el libro. */
export const rewardAdjustmentSchema = z.strictObject({
  points: z
    .number()
    .int()
    .min(-REWARD_ADJUSTMENT_MAX)
    .max(REWARD_ADJUSTMENT_MAX)
    .refine((value) => value !== 0, 'El ajuste no puede ser 0'),
  reason: z.string().trim().min(3, 'Motivo requerido').max(200),
});

/** Canje en el local de una recompensa del catálogo. */
export const rewardRedemptionSchema = z.strictObject({
  rewardId: z.string().uuid(),
});

export type UpdateRewardProgramInput = z.infer<typeof updateRewardProgramSchema>;
export type RewardCatalogInput = z.infer<typeof rewardCatalogInputSchema>;
export type PublicReward = z.infer<typeof publicRewardSchema>;
export type RewardCatalogItem = z.infer<typeof rewardCatalogItemSchema>;
export type StaffRewards = z.infer<typeof staffRewardsSchema>;
export type RewardCustomersQuery = z.infer<typeof rewardCustomersQuerySchema>;
export type RewardCustomer = z.infer<typeof rewardCustomerSchema>;
export type RewardCustomersPage = z.infer<typeof rewardCustomersPageSchema>;
export type StaffLedgerEntry = z.infer<typeof staffLedgerEntrySchema>;
export type RewardCustomerDetail = z.infer<typeof rewardCustomerDetailSchema>;
export type RewardAdjustmentInput = z.infer<typeof rewardAdjustmentSchema>;
export type RewardRedemptionInput = z.infer<typeof rewardRedemptionSchema>;
