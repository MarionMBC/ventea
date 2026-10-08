import type { BillingAddress, PaymentCard } from '@ventea/shared';

import {
  GatewayError,
  type ChargeResult,
  type ChargeStatus,
  type EstablishResult,
  type GatewayAmount,
  type PaymentGateway,
  type RecurringCharge,
  type StatusQuery,
} from './payment-gateway';

/**
 * Qué hace el próximo cobro del `FakeGateway`:
 * - `approve` / `decline` / `error`: respuesta inmediata.
 * - `timeout`: la respuesta se pierde (`unknown`), pero el cobro queda en `final`; `status`
 *   lo devuelve. `withTransactionId: false` simula un timeout antes de tener id.
 * - `unavailable`: la pasarela no atiende (no cobra).
 */
export type FakeBehavior =
  | 'approve'
  | 'decline'
  | 'error'
  | 'unavailable'
  | { timeout: Exclude<ChargeStatus, 'unknown'>; withTransactionId?: boolean };

export interface FakeCharge {
  orderId: string;
  kind: 'establish' | 'recurring';
  amount: GatewayAmount;
  /** Lo que de verdad pasó en el "banco" (`approved` = se movió dinero). */
  outcome: Exclude<ChargeStatus, 'unknown'>;
  initialTransactionId?: string;
}

/**
 * Pasarela falsa SOLO para tests (no la elige `BILLING_MODE`: se inyecta con
 * `overrideProvider(PAYMENT_GATEWAY)`). Guarda cada cobro sin datos de tarjeta.
 */
export class FakeGateway implements PaymentGateway {
  readonly mode = 'ms-payments' as const;
  readonly provider = 'fake';
  readonly charges: FakeCharge[] = [];
  statusQueries = 0;
  private readonly script: FakeBehavior[] = [];
  private sequence = 0;
  /** Para simular un procesador lento (tests de concurrencia). */
  delayMs = 0;

  /** Encola comportamientos para los próximos cobros; sin guion, aprueba. */
  next(...behaviors: FakeBehavior[]): this {
    this.script.push(...behaviors);
    return this;
  }

  reset(): void {
    this.charges.length = 0;
    this.script.length = 0;
    this.statusQueries = 0;
    this.delayMs = 0;
  }

  /** Cobros que movieron dinero. */
  approvedCharges(): FakeCharge[] {
    return this.charges.filter((charge) => charge.outcome === 'approved');
  }

  async tokenizeAndEstablish(
    card: PaymentCard,
    _billing: BillingAddress,
    amount: GatewayAmount,
    orderId: string,
  ): Promise<EstablishResult> {
    const result = await this.charge({ orderId, kind: 'establish', amount });
    return {
      ...result,
      token: `fake-token-${card.number.slice(-4)}`,
      cardBrand: 'visa',
      cardLast4: card.number.slice(-4),
    };
  }

  chargeRecurring(charge: RecurringCharge): Promise<ChargeResult> {
    return this.charge({
      orderId: charge.orderId,
      kind: 'recurring',
      amount: charge.amount,
      initialTransactionId: charge.initialTransactionId,
    });
  }

  status({ orderId, transactionId }: StatusQuery): Promise<ChargeResult> {
    this.statusQueries += 1;
    const charge = this.charges.find((c) => c.orderId === orderId);
    if (!charge || !transactionId) return Promise.resolve({ status: 'unknown' });
    return Promise.resolve({ status: charge.outcome, transactionId });
  }

  private async charge(input: Omit<FakeCharge, 'outcome'>): Promise<ChargeResult> {
    const behavior = this.script.shift() ?? 'approve';
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (behavior === 'unavailable') throw new GatewayError('unavailable', 'fake: no disponible');

    this.sequence += 1;
    const transactionId = `fake-tx-${this.sequence}`;
    const networkTransactionId = `fake-ntid-${this.sequence}`;

    if (typeof behavior === 'object') {
      this.charges.push({ ...input, outcome: behavior.timeout });
      return behavior.withTransactionId === false
        ? { status: 'unknown', message: 'fake: timeout' }
        : { status: 'unknown', transactionId, message: 'fake: timeout' };
    }

    const outcome =
      behavior === 'approve' ? 'approved' : behavior === 'decline' ? 'declined' : 'error';
    this.charges.push({ ...input, outcome });
    return {
      status: outcome,
      transactionId,
      ...(outcome === 'approved' ? { networkTransactionId } : {}),
      message: outcome === 'approved' ? undefined : `fake: ${outcome}`,
    };
  }
}
