import type { BillingAddress, BillingMode, PaymentCard } from '@ventea/shared';

/**
 * Pasarela de cobro de la suscripción (TASK-005). La implementación la elige `BILLING_MODE`
 * (`gateway.provider.ts`); los servicios de billing solo conocen esta interfaz.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface GatewayAmount {
  /** Unidad menor (centavos). */
  amountCents: number;
  currency: string;
}

/**
 * Resultado de un cobro, ya clasificado:
 * - `approved`: el dinero se movió.
 * - `declined`: el banco lo rechazó (fondos, tarjeta vencida…). No se movió nada.
 * - `error`: el procesador respondió con un error suyo. No se movió nada; reintentable.
 * - `unknown`: no se sabe (timeout, `pending`). NUNCA se recobra: se consulta `status`.
 */
export type ChargeStatus = 'approved' | 'declined' | 'error' | 'unknown';

export interface ChargeResult {
  status: ChargeStatus;
  /** Referencia del procesador. Sin ella, un `unknown` no se puede consultar. */
  transactionId?: string;
  /** Id de RED del cobro: el del `establish` ancla todos los recurrentes. */
  networkTransactionId?: string;
  providerCode?: string;
  /** Mensaje para mostrar o auditar. Nunca trae datos de tarjeta. */
  message?: string;
}

export interface EstablishResult extends ChargeResult {
  /** Token permanente de la tarjeta. Presente si la tokenización salió bien. */
  token?: string;
  cardBrand?: string;
  cardLast4?: string;
}

export interface RecurringCharge {
  token: string;
  /** `networkTransactionId` del cobro `establish`: siempre el original, nunca el anterior. */
  initialTransactionId: string;
  expMonth: number | null;
  expYear: number | null;
  amount: GatewayAmount;
  orderId: string;
}

export interface StatusQuery {
  orderId: string;
  transactionId?: string | null;
}

/**
 * La llamada no llegó a cobrar: request inválido (`invalid`), pasarela caída o mal
 * configurada (`unavailable`), o el modo de cobro no admite la operación (`not_supported`).
 * Es seguro reintentar con el mismo `orderId`.
 */
export class GatewayError extends Error {
  constructor(
    readonly kind: 'invalid' | 'unavailable' | 'not_supported',
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface PaymentGateway {
  readonly mode: BillingMode;
  /** Lo que se guarda en `Subscription.paymentProvider` (`cybersource`, `fake`…). */
  readonly provider: string | null;

  /**
   * Tokeniza la tarjeta y hace el primer cobro con el cliente presente (CVV) declarando la
   * credencial guardada (`storedCredential.usage = "establish"`).
   */
  tokenizeAndEstablish(
    card: PaymentCard,
    billing: BillingAddress,
    amount: GatewayAmount,
    orderId: string,
  ): Promise<EstablishResult>;

  /** Cobro sin CVV ni cliente (`usage = "recurring"`). */
  chargeRecurring(charge: RecurringCharge): Promise<ChargeResult>;

  /** Estado final de un cobro cuyo resultado se desconoce. */
  status(query: StatusQuery): Promise<ChargeResult>;
}
