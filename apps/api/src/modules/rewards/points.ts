import { BadRequestException } from '@nestjs/common';

/**
 * Reglas puras del programa de puntos. Sin base de datos: se testean con unit tests
 * y el servicio solo les pasa los datos ya leídos.
 */

export interface RewardProgramRules {
  isEnabled: boolean;
  pointsPerCurrencyUnit: number;
  redemptionValueCents: number;
  minPointsToRedeem: number;
}

/**
 * Puntos que gana un pedido: `floor(totalCents / 100 × pointsPerCurrencyUnit)`.
 *
 * El épsilon absorbe el error de punto flotante del producto (p. ej. 10 × 0.29 da
 * 2.8999999999999995): sin él, un pedido podría ganar un punto menos del que le toca.
 */
export function pointsForOrder(totalCents: number, pointsPerCurrencyUnit: number): number {
  if (totalCents <= 0 || pointsPerCurrencyUnit <= 0) return 0;
  return Math.floor((totalCents / 100) * pointsPerCurrencyUnit + 1e-9);
}

export interface RedemptionInput {
  requestedPoints: number;
  balance: number;
  subtotalCents: number;
  program: RewardProgramRules | null;
}

export interface Redemption {
  /** Puntos que se debitan del saldo. */
  pointsUsed: number;
  discountCents: number;
}

/**
 * Valida y calcula un canje de puntos.
 *
 * `discountCents = min(puntos × redemptionValueCents, subtotal)`. Si el cliente
 * pide más puntos de los que cubren el subtotal, solo se debitan los necesarios:
 * el excedente queda en su saldo en vez de quemarse sin dar descuento.
 */
export function computeRedemption(input: RedemptionInput): Redemption {
  const { requestedPoints, balance, subtotalCents, program } = input;
  if (requestedPoints <= 0) return { pointsUsed: 0, discountCents: 0 };

  if (!program || !program.isEnabled || program.redemptionValueCents <= 0) {
    throw new BadRequestException('El programa de puntos no permite canjes');
  }
  if (requestedPoints < program.minPointsToRedeem) {
    throw new BadRequestException(`El canje mínimo es de ${program.minPointsToRedeem} puntos`);
  }
  if (requestedPoints > balance) {
    throw new BadRequestException('Saldo de puntos insuficiente');
  }

  const pointsNeeded = Math.ceil(subtotalCents / program.redemptionValueCents);
  const pointsUsed = Math.min(requestedPoints, pointsNeeded);
  const discountCents = Math.min(pointsUsed * program.redemptionValueCents, subtotalCents);
  return { pointsUsed, discountCents };
}
