import type { SubscriptionSnapshot } from './subscription-state';

/**
 * Clave donde el TenantMiddleware deja la suscripción del tenant (la trae en la misma
 * consulta, así el SubscriptionMiddleware no paga otra ida a la base). `null` si la
 * marca no tiene suscripción.
 */
export const SUBSCRIPTION_REQUEST_KEY = 'ventea:subscription';

export interface SubscriptionContext extends SubscriptionSnapshot {
  id: string;
}
