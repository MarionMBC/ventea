import {
  HttpException,
  HttpStatus,
  Injectable,
  RequestMethod,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { TENANT_REQUEST_KEY } from '@/common/tenant.context';

import { SUBSCRIPTION_REQUEST_KEY, type SubscriptionContext } from './subscription.context';
import { accessDecision } from './subscription-state';
import { SubscriptionsService } from './subscriptions.service';

/** Mensaje del 402: la app y el web lo muestran tal cual. */
export const SUSPENDED_MESSAGE = 'Servicio suspendido';

/**
 * Rutas de marca que atienden aunque la suscripción no lo haga (sin prefijo `api`, regla
 * de Nest 12):
 * - lo que el dueño necesita para entrar al panel a pagar: `staff/*` (login, tablero),
 *   `tenant` (branding del panel), `auth/refresh` y `billing/*` (TASK-005: tarjeta, plan);
 * - lo que el cliente final necesita para seguir sus pedidos en curso: `GET orders`,
 *   `GET orders/:id` y `GET me`, y dar de baja su dispositivo push al cerrar sesión
 *   (`DELETE devices/:id`, TASK-016). Crear pedidos, el menú, registro y login siguen en 402.
 */
export const SUBSCRIPTION_OPEN_ROUTES: { path: string; method: RequestMethod }[] = [
  { path: 'staff/{*path}', method: RequestMethod.ALL },
  { path: 'tenant', method: RequestMethod.ALL },
  { path: 'auth/refresh', method: RequestMethod.ALL },
  { path: 'billing', method: RequestMethod.ALL },
  { path: 'billing/{*path}', method: RequestMethod.ALL },
  { path: 'orders', method: RequestMethod.GET },
  { path: 'orders/:id', method: RequestMethod.GET },
  { path: 'me', method: RequestMethod.GET },
  { path: 'devices/:id', method: RequestMethod.DELETE },
];

/**
 * Decide si la suscripción de la marca del request atiende. Si la prueba venció, la pasa
 * a `past_due` (con asiento `trial_expired`) aunque la ruta sea abierta: así el estado
 * queda bien también cuando solo entra el staff.
 */
async function subscriptionAllows(
  req: Request,
  subscriptions: SubscriptionsService,
): Promise<boolean> {
  const request = req as unknown as Record<string, unknown>;
  const tenant = request[TENANT_REQUEST_KEY] as { tenantId: string } | undefined;
  if (!tenant) {
    // Programación defensiva: la ruta quedó fuera del TenantMiddleware pero no de este.
    throw new Error('Middleware de suscripción sin tenant: revisar las exclusiones del AppModule.');
  }

  const subscription = (request[SUBSCRIPTION_REQUEST_KEY] ?? null) as SubscriptionContext | null;
  const now = new Date();
  const decision = accessDecision(subscription, now);
  if (decision === 'expire_trial' && subscription) {
    // Con un cobro sin confirmar la prueba no se vence: el dueño pagó y sigue atendiendo.
    const expiry = await subscriptions.expireTrial(tenant.tenantId, subscription.id, now);
    return expiry === 'payment_pending';
  }
  // `grace`: past_due dentro de la gracia (TASK-007) atiende; el aviso lo muestra el panel.
  return decision === 'allow' || decision === 'grace';
}

/**
 * Corta con `402 Servicio suspendido` la API de una marca cuya suscripción no atiende
 * (suspendida, cancelada, `past_due` sin gracia o con la gracia vencida, o en prueba vencida). Corre después del
 * TenantMiddleware, que deja la suscripción en el request. Se aplica a todo salvo
 * `health`, `platform/*` y `SUBSCRIPTION_OPEN_ROUTES` (ver AppModule).
 */
@Injectable()
export class SubscriptionMiddleware implements NestMiddleware {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (await subscriptionAllows(req, this.subscriptions)) return next();
    throw new HttpException(SUSPENDED_MESSAGE, HttpStatus.PAYMENT_REQUIRED);
  }
}

/**
 * En las `SUBSCRIPTION_OPEN_ROUTES`: nunca corta, pero marca la prueba vencida como
 * `past_due` (el panel de plataforma no puede mostrar `trialing` vencido para siempre
 * porque solo entra el staff).
 */
@Injectable()
export class SubscriptionStateMiddleware implements NestMiddleware {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    await subscriptionAllows(req, this.subscriptions);
    next();
  }
}
