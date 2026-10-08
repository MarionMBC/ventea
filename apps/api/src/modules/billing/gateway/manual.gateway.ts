import {
  GatewayError,
  type ChargeResult,
  type EstablishResult,
  type PaymentGateway,
} from './payment-gateway';

const NOT_ENABLED =
  'El cobro con tarjeta no está habilitado: el pago lo registra el equipo de Ventea';

/**
 * `BILLING_MODE=manual`: no hay pasarela. El ciclo no cobra (solo vence estados) y el admin
 * de la plataforma registra los pagos (`record-payment`).
 */
export class ManualGateway implements PaymentGateway {
  readonly mode = 'manual' as const;
  readonly provider = null;

  tokenizeAndEstablish(): Promise<EstablishResult> {
    return Promise.reject(new GatewayError('not_supported', NOT_ENABLED));
  }

  chargeRecurring(): Promise<ChargeResult> {
    return Promise.reject(new GatewayError('not_supported', NOT_ENABLED));
  }

  status(): Promise<ChargeResult> {
    return Promise.resolve({ status: 'unknown', message: NOT_ENABLED });
  }
}
