import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BILLING_MODE, type BillingMode } from '@ventea/shared';

import { ManualGateway } from './manual.gateway';
import { MsPaymentsGateway } from './ms-payments.gateway';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment-gateway';

const DEFAULT_TIMEOUT_MS = 30_000;

export function billingMode(config: ConfigService): BillingMode {
  const raw = config.get<string>('BILLING_MODE')?.trim() || 'manual';
  if (!(BILLING_MODE as readonly string[]).includes(raw)) {
    throw new Error(`BILLING_MODE inválido: "${raw}" (ms-payments | manual)`);
  }
  return raw as BillingMode;
}

/**
 * Pasarela según `BILLING_MODE` (default `manual`). En `ms-payments`, sin URL o clave la API
 * no arranca: un cobro mal configurado tiene que fallar ruidoso al desplegar, no en la
 * primera renovación.
 */
export function createPaymentGateway(config: ConfigService): PaymentGateway {
  if (billingMode(config) === 'manual') return new ManualGateway();

  const url = config.get<string>('MS_PAYMENTS_URL')?.trim();
  const key = config.get<string>('MS_PAYMENTS_KEY')?.trim();
  if (!url || !key) {
    throw new Error('BILLING_MODE=ms-payments exige MS_PAYMENTS_URL y MS_PAYMENTS_KEY');
  }
  const timeout = Number.parseInt(config.get<string>('MS_PAYMENTS_TIMEOUT_MS') ?? '', 10);
  return new MsPaymentsGateway({
    url,
    key,
    provider: config.get<string>('MS_PAYMENTS_PROVIDER')?.trim() || 'cybersource',
    timeoutMs: Number.isInteger(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  });
}

export const paymentGatewayProvider: Provider = {
  provide: PAYMENT_GATEWAY,
  inject: [ConfigService],
  useFactory: createPaymentGateway,
};
