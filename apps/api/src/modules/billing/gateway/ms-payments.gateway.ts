import type { BillingAddress, PaymentCard } from '@ventea/shared';

import {
  establishSaleBody,
  isConnectionRefused,
  mapSaleReply,
  mapStatusReply,
  mapTokenizeReply,
  recurringSaleBody,
  statusBody,
  tokenizeBody,
  type HttpReply,
} from './ms-payments.mapper';
import {
  GatewayError,
  type ChargeResult,
  type EstablishResult,
  type GatewayAmount,
  type PaymentGateway,
  type RecurringCharge,
  type StatusQuery,
} from './payment-gateway';

export interface MsPaymentsConfig {
  /** Base del servicio, sin `/api` (`https://payments.interno`). */
  url: string;
  /** `INTERNAL_SERVICE_KEY` de ms-payments. */
  key: string;
  /** `X-Payment-Provider`. Solo `cybersource` soporta el recurrente sin CVV. */
  provider: string;
  timeoutMs: number;
}

type Operation = 'tokenize' | 'sale' | 'status';

/**
 * Cobro por ms-payments (servicio interno, sin estado). Nunca loguea ni devuelve los cuerpos
 * de los requests: llevan el PAN y el CVV en el alta.
 */
export class MsPaymentsGateway implements PaymentGateway {
  readonly mode = 'ms-payments' as const;
  readonly provider: string;

  constructor(private readonly config: MsPaymentsConfig) {
    this.provider = config.provider;
  }

  async tokenizeAndEstablish(
    card: PaymentCard,
    billing: BillingAddress,
    amount: GatewayAmount,
    orderId: string,
  ): Promise<EstablishResult> {
    const tokenized = mapTokenizeReply(
      await this.post('tokenize', tokenizeBody(card, billing), 'unavailable'),
    );
    if (tokenized.declined) return tokenized.declined;

    const token = tokenized.token!;
    const sale = await this.charge(establishSaleBody(token, card, billing, amount, orderId));
    return {
      ...sale,
      token,
      cardBrand: tokenized.cardBrand,
      // CyberSource no devuelve los últimos 4 en el cobro; se derivan del PAN en memoria.
      cardLast4: tokenized.cardLast4 ?? card.number.slice(-4),
    };
  }

  chargeRecurring(charge: RecurringCharge): Promise<ChargeResult> {
    return this.charge(recurringSaleBody(charge));
  }

  async status({ transactionId }: StatusQuery): Promise<ChargeResult> {
    // ms-payments solo consulta por transactionId: un timeout sin respuesta no tiene uno, y
    // queda desconocido hasta que alguien lo mire en el panel del procesador.
    if (!transactionId) return { status: 'unknown', message: 'Sin transactionId para consultar' };
    try {
      return mapStatusReply(await this.post('status', statusBody(transactionId), 'unknown'));
    } catch (error) {
      if (error instanceof UnknownOutcome) return { status: 'unknown', message: error.message };
      throw error;
    }
  }

  private async charge(body: object): Promise<ChargeResult> {
    try {
      return mapSaleReply(await this.post('sale', body, 'unknown'));
    } catch (error) {
      if (error instanceof UnknownOutcome) return { status: 'unknown', message: error.message };
      throw error;
    }
  }

  /**
   * POST a ms-payments. Un fallo de transporte se traduce según la operación: si la conexión
   * no se abrió, nada salió (`GatewayError unavailable`); si se cortó o venció el timeout,
   * en un cobro no se sabe qué pasó (`UnknownOutcome`).
   */
  private async post(
    operation: Operation,
    body: object,
    onLostResponse: 'unknown' | 'unavailable',
  ): Promise<HttpReply> {
    let response: Response;
    try {
      response = await fetch(`${this.config.url.replace(/\/+$/, '')}/api/payments/${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Key': this.config.key,
          'X-Payment-Provider': this.config.provider,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      if (isConnectionRefused(error) || onLostResponse === 'unavailable') {
        throw new GatewayError('unavailable', `ms-payments inalcanzable (${operation})`);
      }
      throw new UnknownOutcome(`Sin respuesta de ms-payments (${operation}): estado desconocido`);
    }

    // Un proxy con HTML (o el cuerpo cortado por el timeout) queda en null: el mapper lo
    // clasifica por el status HTTP.
    const parsed: unknown = await response.json().catch(() => null);
    return { status: response.status, body: parsed };
  }
}

/** Se perdió la respuesta de un cobro: puede o no haber cobrado. */
class UnknownOutcome extends Error {}
