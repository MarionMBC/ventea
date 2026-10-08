import { paymentMethodInputSchema } from '@ventea/shared';

import { redactSensitive } from '@/common/logging/redact';
import {
  afterRenewalFailure,
  checkApproval,
  dueAt,
  establishOrderId,
  graceExpired,
  MAX_RENEWAL_ATTEMPTS,
  MIN_RETRY_GAP_HOURS,
  monthlyValueCents,
  nextPeriodStart,
  ORDER_ID_MAX_LENGTH,
  planPriceCents,
  rawCardApiAllowed,
  renewalOrderId,
} from '@/modules/billing/billing-rules';
import { addDays, periodEnd } from '@/modules/subscriptions/subscription-state';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const SUB_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PLAN = { priceMonthlyCents: 2500, priceYearlyCents: 25000 };

describe('dunning: afterRenewalFailure', () => {
  const due = new Date('2026-11-08T12:00:00.000Z');

  const onTime = (days: number) => new Date(addDays(due, days).getTime() + 60_000);

  it('rechazos 1, 2 y 3 → past_due con reintento a los días 1, 3 y 7 del vencimiento', () => {
    expect(afterRenewalFailure(1, due, onTime(0))).toEqual({
      status: 'past_due',
      retryAt: addDays(due, 1),
    });
    expect(afterRenewalFailure(2, due, onTime(1))).toEqual({
      status: 'past_due',
      retryAt: addDays(due, 3),
    });
    expect(afterRenewalFailure(3, due, onTime(3))).toEqual({
      status: 'past_due',
      retryAt: addDays(due, 7),
    });
  });

  it('el 4.º rechazo suspende', () => {
    expect(MAX_RENEWAL_ATTEMPTS).toBe(4);
    expect(afterRenewalFailure(4, due, onTime(7))).toEqual({ status: 'suspended', retryAt: null });
  });

  it('catch-up (ciclo parado 10 días): el reintento se espacia desde ahora, sin ráfaga', () => {
    const late = addDays(due, 10);
    const decision = afterRenewalFailure(1, due, late);
    expect(decision.retryAt!.getTime() - late.getTime()).toBe(MIN_RETRY_GAP_HOURS * 3600_000);
  });
});

describe('checkApproval', () => {
  const expected = { orderId: 'sub-x-a1', amount: { amountCents: 5900, currency: 'USD' } };

  it('aprobado con mismo monto y orderId (o sin eco) → aprobado', () => {
    const ok = {
      status: 'approved' as const,
      orderId: 'sub-x-a1',
      approvedAmount: { amountCents: 5900, currency: 'usd' },
    };
    expect(checkApproval(ok, expected)).toBe(ok);
    expect(checkApproval({ status: 'approved' }, expected).status).toBe('approved');
  });

  it.each([
    ['monto distinto', { approvedAmount: { amountCents: 100, currency: 'USD' } }],
    ['otra moneda', { approvedAmount: { amountCents: 5900, currency: 'HNL' } }],
    ['otro orderId', { orderId: 'sub-y-a1' }],
    ['autorización parcial', { partial: true }],
  ])('%s → unknown con alerta (no se da por pagado)', (_name, extra) => {
    const result = checkApproval({ status: 'approved', ...extra }, expected);
    expect(result.status).toBe('unknown');
    expect(result.alert).toMatch(/sub-x-a1/);
  });

  it('un rechazo o un desconocido pasan tal cual', () => {
    expect(checkApproval({ status: 'declined' }, expected).status).toBe('declined');
    expect(checkApproval({ status: 'unknown' }, expected).status).toBe('unknown');
  });
});

describe('rawCardApiAllowed (PCI)', () => {
  it('en producción con cobro real exige ALLOW_RAW_CARD_API=true', () => {
    const prod = { nodeEnv: 'production', mode: 'ms-payments' as const };
    expect(rawCardApiAllowed({ ...prod, allowRawCard: undefined })).toBe(false);
    expect(rawCardApiAllowed({ ...prod, allowRawCard: '1' })).toBe(false);
    expect(rawCardApiAllowed({ ...prod, allowRawCard: 'true' })).toBe(true);
  });

  it('fuera de producción, o en modo manual, no aplica', () => {
    expect(
      rawCardApiAllowed({ nodeEnv: 'test', mode: 'ms-payments', allowRawCard: undefined }),
    ).toBe(true);
    expect(
      rawCardApiAllowed({ nodeEnv: 'production', mode: 'manual', allowRawCard: undefined }),
    ).toBe(true);
  });
});

describe('nextPeriodStart', () => {
  const base = { trialEndsAt: null, currentPeriodEnd: addDays(NOW, -1) };

  it('en prueba vigente, el período pagado empieza al terminar la prueba', () => {
    const trialEndsAt = addDays(NOW, 5);
    expect(nextPeriodStart({ ...base, status: 'trialing', trialEndsAt }, NOW)).toEqual(trialEndsAt);
  });

  it('active con período vigente: pago adelantado, empieza al fin del actual', () => {
    const currentPeriodEnd = addDays(NOW, 10);
    expect(nextPeriodStart({ ...base, status: 'active', currentPeriodEnd }, NOW)).toEqual(
      currentPeriodEnd,
    );
  });

  it.each(['past_due', 'suspended', 'canceled'] as const)(
    '%s con el período vencido: desde ahora',
    (status) => {
      expect(nextPeriodStart({ ...base, status }, NOW)).toEqual(NOW);
    },
  );

  it('suspendida a mano a mitad de período: desde el fin del período (nunca solapa)', () => {
    const currentPeriodEnd = addDays(NOW, 12);
    expect(nextPeriodStart({ ...base, status: 'suspended', currentPeriodEnd }, NOW)).toEqual(
      currentPeriodEnd,
    );
  });

  it('prueba ya vencida: desde ahora (no se cobran días pasados)', () => {
    const trialEndsAt = addDays(NOW, -3);
    expect(nextPeriodStart({ ...base, status: 'trialing', trialEndsAt }, NOW)).toEqual(NOW);
  });
});

describe('fechas con clamp de fin de mes (renovación)', () => {
  it('31 ene + 1 mes = 28 feb; la renovación siguiente parte del 28', () => {
    const start = new Date('2027-01-31T10:00:00.000Z');
    const end = periodEnd(start, 'month');
    expect(end.toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(periodEnd(end, 'month').toISOString()).toBe('2027-03-28T10:00:00.000Z');
  });

  it('29 feb + 1 año = 28 feb', () => {
    expect(periodEnd(new Date('2028-02-29T00:00:00.000Z'), 'year').toISOString()).toBe(
      '2029-02-28T00:00:00.000Z',
    );
  });
});

describe('orderId', () => {
  it('renovación: determinístico por suscripción, período e intento, ≤ 50 caracteres', () => {
    const periodStart = new Date('2026-11-08T12:00:00.000Z');
    const id = renewalOrderId(SUB_ID, periodStart, 4);
    expect(id).toBe('sub-0f8fad5bd9cb469fa16570867728950e-20261108-a4');
    expect(renewalOrderId(SUB_ID, periodStart, 4)).toBe(id);
    expect(renewalOrderId(SUB_ID, periodStart, 3)).not.toBe(id);
    expect(id.length).toBeLessThanOrEqual(ORDER_ID_MAX_LENGTH);
  });

  it('alta: único por instante, ≤ 50 caracteres', () => {
    const id = establishOrderId(SUB_ID, NOW);
    expect(id.startsWith('est-0f8fad5b')).toBe(true);
    expect(id).not.toBe(establishOrderId(SUB_ID, addDays(NOW, 1)));
    expect(id.length).toBeLessThanOrEqual(ORDER_ID_MAX_LENGTH);
  });
});

describe('precios y gracia', () => {
  it('precio por intervalo y aporte al MRR (anual / 12)', () => {
    expect(planPriceCents(PLAN, 'month')).toBe(2500);
    expect(planPriceCents(PLAN, 'year')).toBe(25000);
    expect(monthlyValueCents(PLAN, 'month')).toBe(2500);
    expect(monthlyValueCents(PLAN, 'year')).toBe(2083);
  });

  it('gracia de 7 días desde el vencimiento', () => {
    const due = addDays(NOW, -7);
    expect(graceExpired(due, NOW)).toBe(true);
    expect(graceExpired(addDays(due, 1), NOW)).toBe(false);
  });

  it('vencimiento: fin de la prueba en prueba, si no fin del período', () => {
    const trialEndsAt = addDays(NOW, 2);
    const currentPeriodEnd = addDays(NOW, 9);
    expect(dueAt({ status: 'trialing', trialEndsAt, currentPeriodEnd })).toEqual(trialEndsAt);
    expect(dueAt({ status: 'past_due', trialEndsAt, currentPeriodEnd })).toEqual(currentPeriodEnd);
  });
});

describe('alta de tarjeta: validación (paymentMethodInputSchema)', () => {
  const valid = {
    card: {
      number: '4111 1111 1111 1111',
      expiryMonth: '3',
      expiryYear: '31',
      cvv: '123',
      holder: 'Ana Pérez',
    },
    billing: { country: 'hn' },
  };

  it('normaliza número, mes, año y país', () => {
    const parsed = paymentMethodInputSchema.parse(valid);
    expect(parsed.card).toMatchObject({
      number: '4111111111111111',
      expiryMonth: '03',
      expiryYear: '2031',
    });
    expect(parsed.billing.country).toBe('HN');
  });

  it('rechaza Luhn inválido y tarjeta vencida sin devolver el número en el error', () => {
    const luhn = paymentMethodInputSchema.safeParse({
      ...valid,
      card: { ...valid.card, number: '4111111111111112' },
    });
    expect(luhn.success).toBe(false);
    expect(JSON.stringify(luhn.error?.issues)).not.toContain('4111111111111112');

    const expired = paymentMethodInputSchema.safeParse({
      ...valid,
      card: { ...valid.card, expiryYear: '2020' },
    });
    expect(expired.success).toBe(false);
  });
});

describe('redactSensitive (logger)', () => {
  it('tacha un PAN suelto, con espacios o con guiones', () => {
    expect(redactSensitive('tarjeta 4111111111111111 rechazada')).toBe('tarjeta [PAN] rechazada');
    expect(redactSensitive('pan 4111 1111 1111 1111.')).toBe('pan [PAN].');
    expect(redactSensitive('pan 5555-5555-5555-4444')).toBe('pan [PAN]');
  });

  it('tacha cvv y número en JSON y en clave=valor, sea cual sea el valor', () => {
    const json = JSON.stringify({ card: { number: '4111111111111111', cvv: '123' } });
    const out = redactSensitive(`body ${json}`);
    expect(out).not.toContain('4111111111111111');
    expect(out).not.toContain('"123"');
    expect(out).toContain('[REDACTED]');
    expect(redactSensitive('cvv=987 securityCode: 4321')).not.toMatch(/987|4321/);
  });

  it('PAN con puntos', () => {
    expect(redactSensitive('pan 4111.1111.1111.1111 fin')).toBe('pan [PAN] fin');
  });

  it('claves csc, cvc, card_cvc, cvc2, securityCode y cardNumber', () => {
    const out = redactSensitive(
      '{"csc":"111","cvc":"222","card_cvc":"333","cvc2":"444","securityCode":"555","cardNumber":"x9"}',
    );
    expect(out).not.toMatch(/111|222|333|444|555|x9/);
  });

  it('JSON escapado una y dos veces (body dentro de otro string)', () => {
    const once = JSON.stringify(JSON.stringify({ card: { cvv: '737', number: 'abc' } }));
    const twice = JSON.stringify(once);
    for (const text of [once, twice]) {
      const out = redactSensitive(`body ${text}`);
      expect(out).not.toContain('737');
      expect(out).not.toContain('abc');
      expect(out).toContain('[REDACTED]');
    }
  });

  it('no toca ids largos que no pasan Luhn ni texto común', () => {
    expect(redactSensitive('tx 1234567890123 ok')).toBe('tx 1234567890123 ok');
    expect(redactSensitive('Período hasta 2026-11-08')).toBe('Período hasta 2026-11-08');
  });
});
