import { Logger } from '@nestjs/common';
import type { BillingEventType } from '@ventea/shared';

export const BILLING_NOTIFIER = Symbol('BILLING_NOTIFIER');

export interface BillingNotification {
  tenantId: string;
  type: BillingEventType;
  message: string;
}

/**
 * Aviso de un evento de cobro (rechazo, suspensión, cobro sin confirmar…). Hoy solo log; el
 * email se enchufa después implementando esta interfaz. El evento ya quedó en `BillingEvent`:
 * un aviso que falla no deshace nada.
 */
export interface BillingNotifier {
  notify(notification: BillingNotification): Promise<void>;
}

export class LogBillingNotifier implements BillingNotifier {
  private readonly logger = new Logger('BillingNotifier');

  notify({ tenantId, type, message }: BillingNotification): Promise<void> {
    this.logger.log(`[${type}] tenant ${tenantId}: ${message}`);
    return Promise.resolve();
  }
}
