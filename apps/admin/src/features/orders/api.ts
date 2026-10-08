import { staffOrderSchema, type OrderStatus, type StaffOrder } from '@ventea/shared';

import type { ApiClient } from '@/lib/api';

import { ACTIVE_STATUSES, HISTORY_STATUSES } from './transitions';

export const ORDERS_QUERY_KEY = ['orders'] as const;
export const ACTIVE_ORDERS_QUERY_KEY = [...ORDERS_QUERY_KEY, 'active'] as const;
export const historyQueryKey = (since: string) => [...ORDERS_QUERY_KEY, 'history', since] as const;

const staffOrderListSchema = staffOrderSchema.array();

function listByStatus(
  client: ApiClient,
  status: OrderStatus,
  extra: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<StaffOrder[]> {
  const query = new URLSearchParams({ status, ...extra });
  return client.request(`/staff/orders?${query.toString()}`, {
    schema: staffOrderListSchema,
    signal,
  });
}

/**
 * Pedidos activos (nuevos, en cocina, listos). Una petición por estado en vez de una
 * sin filtro: el listado corta en 200, y los entregados del día no deben empujar
 * fuera del tablero a un pedido activo viejo.
 */
export async function fetchActiveOrders(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<StaffOrder[]> {
  const lists = await Promise.all(
    ACTIVE_STATUSES.map((status) => listByStatus(client, status, {}, signal)),
  );
  return lists.flat();
}

/** Medianoche local del dispositivo: «hoy» es el día del mostrador, no el de la API. */
export function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Entregados y cancelados desde `since`, el más reciente primero. */
export async function fetchHistory(
  client: ApiClient,
  since: Date,
  signal?: AbortSignal,
): Promise<StaffOrder[]> {
  const lists = await Promise.all(
    HISTORY_STATUSES.map((status) =>
      listByStatus(client, status, { since: since.toISOString() }, signal),
    ),
  );
  return lists
    .flat()
    .filter((order) => order.placedAt.getTime() >= since.getTime())
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
}

export function updateOrderStatus(
  client: ApiClient,
  orderId: string,
  status: OrderStatus,
): Promise<StaffOrder> {
  return client.request(`/staff/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: { status },
    schema: staffOrderSchema,
  });
}
