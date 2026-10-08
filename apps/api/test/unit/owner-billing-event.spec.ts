import { toOwnerBillingEvent } from '../../src/modules/billing/billing.mapper';

const base = { type: 'payment_failed' as const, amountCents: 5900, createdAt: new Date() };

describe('toOwnerBillingEvent', () => {
  it('un rechazo del banco se describe como rechazo, no como error genérico', () => {
    const rejected = toOwnerBillingEvent({ ...base, status: 'failed' });
    expect(rejected.description).not.toBe('No se pudo procesar el cobro');
  });

  it('un 400 de la pasarela (no llegó al banco) se describe como error de procesamiento', () => {
    expect(toOwnerBillingEvent({ ...base, status: 'failed_non_bank' }).description).toBe(
      'No se pudo procesar el cobro',
    );
  });
});
