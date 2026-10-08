import {
  accessDecision,
  addDays,
  extendedTrialEnd,
  nextStatus,
  periodEnd,
} from '@/modules/subscriptions/subscription-state';

const NOW = new Date('2026-10-08T12:00:00.000Z');

describe('accessDecision', () => {
  it('active atiende aunque el período haya vencido (sin cobro automático todavía)', () => {
    expect(accessDecision({ status: 'active', trialEndsAt: null }, NOW)).toBe('allow');
    expect(accessDecision({ status: 'active', trialEndsAt: addDays(NOW, -100) }, NOW)).toBe(
      'allow',
    );
  });

  it('trialing atiende hasta el fin de la prueba', () => {
    expect(accessDecision({ status: 'trialing', trialEndsAt: addDays(NOW, 1) }, NOW)).toBe('allow');
  });

  it('trialing vencida (o justo en el borde) pide pasar a past_due', () => {
    expect(accessDecision({ status: 'trialing', trialEndsAt: addDays(NOW, -1) }, NOW)).toBe(
      'expire_trial',
    );
    expect(accessDecision({ status: 'trialing', trialEndsAt: NOW }, NOW)).toBe('expire_trial');
  });

  it.each(['past_due', 'suspended', 'canceled'] as const)('%s bloquea', (status) => {
    expect(accessDecision({ status, trialEndsAt: null }, NOW)).toBe('block');
  });

  it('sin suscripción no corta el servicio (falla abierta)', () => {
    expect(accessDecision(null, NOW)).toBe('allow');
  });
});

describe('nextStatus', () => {
  it.each([
    ['trialing', 'suspend', 'suspended'],
    ['active', 'suspend', 'suspended'],
    ['past_due', 'suspend', 'suspended'],
    ['suspended', 'reactivate', 'active'],
    ['past_due', 'reactivate', 'active'],
    ['canceled', 'reactivate', 'active'],
    ['trialing', 'extend_trial', 'trialing'],
    ['past_due', 'extend_trial', 'trialing'],
    ['active', 'change_plan', 'active'],
    ['suspended', 'change_plan', 'suspended'],
    ['trialing', 'change_plan', 'trialing'],
  ] as const)('%s --%s--> %s', (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  it.each([
    ['suspended', 'suspend'],
    ['canceled', 'suspend'],
    ['active', 'reactivate'],
    ['trialing', 'reactivate'],
    ['active', 'extend_trial'],
    ['suspended', 'extend_trial'],
    ['canceled', 'extend_trial'],
    ['canceled', 'change_plan'],
  ] as const)('%s no admite %s', (from, action) => {
    expect(nextStatus(from, action)).toBeNull();
  });
});

describe('fechas de la suscripción', () => {
  it('periodEnd suma un mes o un año calendario', () => {
    expect(periodEnd(NOW, 'month').toISOString()).toBe('2026-11-08T12:00:00.000Z');
    expect(periodEnd(NOW, 'year').toISOString()).toBe('2027-10-08T12:00:00.000Z');
  });

  it('extender una prueba vigente suma desde su fin', () => {
    const end = addDays(NOW, 3);
    expect(extendedTrialEnd(end, NOW, 7)).toEqual(addDays(NOW, 10));
  });

  it('extender una prueba vencida (o sin fecha) suma desde hoy', () => {
    expect(extendedTrialEnd(addDays(NOW, -30), NOW, 7)).toEqual(addDays(NOW, 7));
    expect(extendedTrialEnd(null, NOW, 5)).toEqual(addDays(NOW, 5));
  });
});
