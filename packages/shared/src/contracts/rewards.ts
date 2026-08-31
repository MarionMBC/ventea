import { z } from 'zod';
import { REWARD_LEDGER_REASON } from '../domain/enums.js';

/**
 * Los puntos se llevan como libro contable (append-only), no como un contador editable:
 * el saldo es la suma de los asientos. Así toda variación tiene causa auditable y
 * un ajuste manual no borra la historia.
 */
export const rewardLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  points: z.number().int(), // positivo acredita, negativo debita
  reason: z.enum(REWARD_LEDGER_REASON),
  orderId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const rewardBalanceSchema = z.object({
  customerId: z.string().uuid(),
  balance: z.number().int().nonnegative(),
  lifetimeEarned: z.number().int().nonnegative(),
});

/** Reglas de puntos por tenant: cada marca define su propio programa. */
export const rewardProgramSchema = z.object({
  isEnabled: z.boolean(),
  pointsPerCurrencyUnit: z.number().nonnegative(), // puntos por unidad monetaria gastada
  redemptionValueCents: z.number().int().nonnegative(), // cuánto vale 1 punto al canjear
  minPointsToRedeem: z.number().int().nonnegative(),
  signupBonusPoints: z.number().int().nonnegative(),
});

export type RewardLedgerEntry = z.infer<typeof rewardLedgerEntrySchema>;
export type RewardBalance = z.infer<typeof rewardBalanceSchema>;
export type RewardProgram = z.infer<typeof rewardProgramSchema>;
