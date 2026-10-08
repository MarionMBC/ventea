import { HttpException, HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { TENANT_REQUEST_KEY } from '@/common/tenant.context';

import { SUBSCRIPTION_REQUEST_KEY, type SubscriptionContext } from './subscription.context';
import { accessDecision } from './subscription-state';
import { SubscriptionsService } from './subscriptions.service';

/** Mensaje del 402: la app y el web lo muestran tal cual. */
export const SUSPENDED_MESSAGE = 'Servicio suspendido';

/**
 * Corta con `402 Servicio suspendido` la API de una marca cuya suscripción no atiende
 * (suspendida, cancelada, `past_due`, o en prueba vencida, que de paso pasa a
 * `past_due`). Corre después del TenantMiddleware, que deja la suscripción en el request.
 *
 * Quedan fuera (ver AppModule): `health`, `platform/*`, y lo que el dueño necesita para
 * entrar al panel a pagar — `staff/*` (login y tablero), `tenant` (branding del panel) y
 * `auth/refresh`.
 */
@Injectable()
export class SubscriptionMiddleware implements NestMiddleware {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const request = req as unknown as Record<string, unknown>;
    const tenant = request[TENANT_REQUEST_KEY] as { tenantId: string } | undefined;
    if (!tenant) {
      // Programación defensiva: la ruta quedó fuera del TenantMiddleware pero no de este.
      throw new Error('SubscriptionMiddleware sin tenant: revisar las exclusiones del AppModule.');
    }

    const subscription = (request[SUBSCRIPTION_REQUEST_KEY] ?? null) as SubscriptionContext | null;
    const now = new Date();
    const decision = accessDecision(subscription, now);
    if (decision === 'allow') return next();

    if (decision === 'expire_trial' && subscription) {
      await this.subscriptions.expireTrial(tenant.tenantId, subscription.id, now);
    }
    throw new HttpException(SUSPENDED_MESSAGE, HttpStatus.PAYMENT_REQUIRED);
  }
}
