import type { BillingAddress, PaymentCard } from '@ventea/shared';

import {
  GatewayError,
  type ChargeResult,
  type ChargeStatus,
  type GatewayAmount,
  type RecurringCharge,
} from './payment-gateway';

/**
 * Traducción entre Ventea y ms-payments (lógica pura, probada con las respuestas del README
 * de ms-payments). Contrato verificado en `ms-payments/src/http/payments.controller.ts`,
 * `src/core/types.ts` y `src/core/errors.ts`:
 *
 * - Envelope: `200 {success: true, data}` o `{success: false, code, message, providerCode?}`
 *   con el status HTTP del código (`HTTP_STATUS_BY_CODE`). El middleware de clave interna
 *   responde `401`/`503` con `{success: false, error}` (sin `code`).
 * - Un rechazo puede venir con **HTTP 200** y `data.status` `declined`/`failed`.
 * - `provider_timeout` (504) = estado desconocido: consultar `status`, nunca recobrar.
 * - `status` se consulta SOLO por `transactionId`.
 */

/** Respuesta HTTP ya leída. `body` es el JSON parseado, o `null` si no era JSON. */
export interface HttpReply {
  status: number;
  body: unknown;
}

const APPROVED = new Set(['approved', 'captured', 'authorized']);
const DECLINED = new Set(['declined', 'failed', 'voided']);

/** `PaymentStatus` de ms-payments → resultado de Ventea. Lo que no se reconoce es desconocido. */
export function classifyPaymentStatus(status: unknown): ChargeStatus {
  if (typeof status !== 'string') return 'unknown';
  if (APPROVED.has(status)) return 'approved';
  if (DECLINED.has(status)) return 'declined';
  return 'unknown'; // pending, unknown y cualquier valor nuevo
}

// ─── Requests ────────────────────────────────────────────────────────────────

function money({ amountCents, currency }: GatewayAmount) {
  return { amountMinor: amountCents, currency };
}

export function tokenizeBody(card: PaymentCard, billing: BillingAddress) {
  return {
    card: {
      number: card.number,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      cvv: card.cvv,
      holder: card.holder,
    },
    billing,
  };
}

/** Primer cobro, cliente presente: con CVV y `storedCredential.usage = "establish"`. */
export function establishSaleBody(
  token: string,
  card: PaymentCard,
  billing: BillingAddress,
  amount: GatewayAmount,
  orderId: string,
) {
  return {
    orderId,
    amount: money(amount),
    token,
    cvv: card.cvv,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    holder: card.holder,
    billing,
    description: 'Suscripción Ventea',
    storedCredential: { usage: 'establish' },
  };
}

/**
 * Cobro recurrente: sin CVV (no se guarda, PCI DSS) y anclado al `networkTransactionId` del
 * `establish` — siempre el original de la serie, no el del cobro anterior.
 */
export function recurringSaleBody(charge: RecurringCharge) {
  return {
    orderId: charge.orderId,
    amount: money(charge.amount),
    token: charge.token,
    ...(charge.expMonth ? { expiryMonth: String(charge.expMonth).padStart(2, '0') } : {}),
    ...(charge.expYear ? { expiryYear: String(charge.expYear) } : {}),
    description: 'Suscripción Ventea',
    storedCredential: { usage: 'recurring', initialTransactionId: charge.initialTransactionId },
  };
}

export function statusBody(transactionId: string) {
  return { transactionId };
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

interface Envelope {
  success: boolean;
  data: Record<string, unknown>;
  code?: string;
  message?: string;
  providerCode?: string;
}

function envelope(body: unknown): Envelope | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (typeof value.success !== 'boolean') return null;
  return {
    success: value.success,
    data:
      value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : {},
    code: typeof value.code === 'string' ? value.code : undefined,
    message:
      typeof value.message === 'string'
        ? value.message
        : typeof value.error === 'string'
          ? value.error
          : undefined,
    providerCode: typeof value.providerCode === 'string' ? value.providerCode : undefined,
  };
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Errores que garantizan que el cobro NO llegó al procesador: es seguro reintentar igual. */
function notSent(reply: HttpReply, env: Envelope | null): GatewayError | null {
  const code = env?.code;
  if (code === 'invalid_request' || reply.status === 400) {
    return new GatewayError('invalid', env?.message ?? 'ms-payments rechazó el request (400)');
  }
  if (
    code === 'authentication_failed' ||
    code === 'provider_not_configured' ||
    [401, 403, 429, 501, 503].includes(reply.status)
  ) {
    return new GatewayError(
      'unavailable',
      `ms-payments no disponible (${reply.status}${code ? ` ${code}` : ''})`,
    );
  }
  return null;
}

/** Respuesta de `POST /payments/sale`. */
export function mapSaleReply(reply: HttpReply): ChargeResult {
  const env = envelope(reply.body);

  if (reply.status >= 200 && reply.status < 300 && env?.success) {
    const { data } = env;
    return {
      status: classifyPaymentStatus(data.status),
      transactionId: text(data.transactionId),
      networkTransactionId: text(data.networkTransactionId),
      providerCode: text(data.providerCode),
      message: text(data.message),
    };
  }

  const blocked = notSent(reply, env);
  if (blocked) throw blocked;

  const failure = { providerCode: env?.providerCode, message: env?.message };
  switch (env?.code) {
    case 'declined':
      return { status: 'declined', ...failure };
    case 'provider_error':
      return { status: 'error', ...failure };
    default:
      // provider_timeout, not_found, internal_error, un 5xx de un proxy sin JSON…: no se
      // sabe si el procesador cobró.
      return { status: 'unknown', ...failure };
  }
}

/** Respuesta de `POST /payments/status`. Un 404 es "todavía no indexado", no "no existe". */
export function mapStatusReply(reply: HttpReply): ChargeResult {
  const env = envelope(reply.body);
  if (reply.status >= 200 && reply.status < 300 && env?.success) {
    return {
      status: classifyPaymentStatus(env.data.status),
      transactionId: text(env.data.transactionId),
      providerCode: text(env.data.providerCode),
      message: text(env.data.message),
    };
  }
  const blocked = notSent(reply, env);
  if (blocked) throw blocked;
  return { status: 'unknown', providerCode: env?.providerCode, message: env?.message };
}

export interface TokenizeOutcome {
  token?: string;
  cardBrand?: string;
  cardLast4?: string;
  /** Presente si la pasarela rechazó la tarjeta al tokenizar. */
  declined?: ChargeResult;
}

/** Respuesta de `POST /payments/tokenize`. Tokenizar no mueve dinero: ante la duda, error. */
export function mapTokenizeReply(reply: HttpReply): TokenizeOutcome {
  const env = envelope(reply.body);
  if (reply.status >= 200 && reply.status < 300 && env?.success) {
    const token = text(env.data.token);
    if (!token) throw new GatewayError('unavailable', 'ms-payments no devolvió token');
    return {
      token,
      cardBrand: text(env.data.cardBrand),
      cardLast4: text(env.data.cardLast4),
    };
  }
  const blocked = notSent(reply, env);
  if (blocked) throw blocked;
  if (env?.code === 'declined') {
    return {
      declined: { status: 'declined', providerCode: env.providerCode, message: env.message },
    };
  }
  throw new GatewayError(
    'unavailable',
    `No se pudo tokenizar la tarjeta (${reply.status}${env?.code ? ` ${env.code}` : ''})`,
  );
}

/**
 * Error de transporte (fetch rechazado). Si la conexión ni se abrió, no se cobró nada
 * (`unavailable`); un timeout o una conexión cortada a mitad, puede que sí (`unknown`).
 */
export function isConnectionRefused(error: unknown): boolean {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const code = typeof cause?.code === 'string' ? cause.code : undefined;
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN';
}
