import { BadRequestException } from '@nestjs/common';

import {
  computeRedemption,
  pointsForOrder,
  type RewardProgramRules,
} from '@/modules/rewards/points';

const PROGRAM: RewardProgramRules = {
  isEnabled: true,
  pointsPerCurrencyUnit: 1,
  redemptionValueCents: 10,
  minPointsToRedeem: 5,
};

describe('pointsForOrder', () => {
  it('floor(totalCents / 100 × pointsPerCurrencyUnit)', () => {
    expect(pointsForOrder(1290, 1)).toBe(12);
    expect(pointsForOrder(1290, 0.01)).toBe(0);
    expect(pointsForOrder(250000, 0.01)).toBe(25);
  });

  it('no pierde un punto por error de punto flotante', () => {
    // 1000 / 100 × 0.29 = 2.8999999999999995 en float
    expect(pointsForOrder(1000, 0.29)).toBe(2);
    // 700 / 100 × 0.1 = 0.7000000000000001; 300 × 0.1 / 100 ... casos de borde exactos:
    expect(pointsForOrder(1000, 0.3)).toBe(3);
    expect(pointsForOrder(10000, 0.07)).toBe(7);
  });

  it('cero si el total o la tasa no son positivos', () => {
    expect(pointsForOrder(0, 1)).toBe(0);
    expect(pointsForOrder(1000, 0)).toBe(0);
  });
});

describe('computeRedemption', () => {
  const base = { balance: 100, subtotalCents: 5000, program: PROGRAM };

  it('sin canje no hay descuento ni validación', () => {
    expect(computeRedemption({ ...base, requestedPoints: 0, program: null })).toEqual({
      pointsUsed: 0,
      discountCents: 0,
    });
  });

  it('descuento = puntos × redemptionValueCents', () => {
    expect(computeRedemption({ ...base, requestedPoints: 20 })).toEqual({
      pointsUsed: 20,
      discountCents: 200,
    });
  });

  it('el descuento no supera el subtotal y no se queman puntos de más', () => {
    expect(computeRedemption({ ...base, requestedPoints: 100, subtotalCents: 455 })).toEqual({
      pointsUsed: 46,
      discountCents: 455,
    });
  });

  it('rechaza un canje mayor al saldo', () => {
    expect(() => computeRedemption({ ...base, requestedPoints: 101 })).toThrow(
      /Saldo de puntos insuficiente/,
    );
  });

  it('rechaza un canje menor al mínimo', () => {
    expect(() => computeRedemption({ ...base, requestedPoints: 4 })).toThrow(/mínimo/);
  });

  it('rechaza canjes con el programa apagado', () => {
    expect(() =>
      computeRedemption({
        ...base,
        requestedPoints: 10,
        program: { ...PROGRAM, isEnabled: false },
      }),
    ).toThrow(BadRequestException);
  });
});
