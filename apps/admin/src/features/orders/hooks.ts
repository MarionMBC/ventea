import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type Mutation,
} from '@tanstack/react-query';
import type { OrderStatus, StaffOrder } from '@ventea/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from '@/app/services';
import { describeError, useT } from '@/i18n';
import { ApiError } from '@/lib/api';

import {
  ACTIVE_ORDERS_QUERY_KEY,
  fetchActiveOrders,
  fetchHistory,
  historyQueryKey,
  ORDERS_QUERY_KEY,
  updateOrderStatus,
} from './api';
import { applyStatus, upsertOrder } from './transitions';

/** Cada cuánto se recarga el tablero solo (AC4: un pedido nuevo aparece en ≤ 10 s). */
export const BOARD_REFRESH_MS = 10_000;

const UPDATE_STATUS_KEY = ['orders', 'update-status'] as const;

export function useActiveOrders() {
  const client = useApi();
  // Con un cambio de estado en vuelo no se recarga: una lectura que cae entre el PATCH
  // y su commit haría saltar la tarjeta para atrás. Al terminar, onSettled recarga.
  const mutating = useIsMutating({ mutationKey: UPDATE_STATUS_KEY });
  return useQuery({
    queryKey: ACTIVE_ORDERS_QUERY_KEY,
    queryFn: ({ signal }) => fetchActiveOrders(client, signal),
    refetchInterval: mutating > 0 ? false : BOARD_REFRESH_MS,
    // La pestaña del panel puede quedar detrás de otra: el contador del título sigue.
    refetchIntervalInBackground: true,
  });
}

export function useOrderHistory(since: Date) {
  const client = useApi();
  return useQuery({
    queryKey: historyQueryKey(since.toISOString()),
    queryFn: ({ signal }) => fetchHistory(client, since, signal),
    refetchInterval: 30_000,
  });
}

/** Reloj que avanza solo, para los «hace N min» de las tarjetas. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export interface Notice {
  id: number;
  tone: 'info' | 'warning' | 'error';
  text: string;
}

/** Avisos efímeros del tablero (se van solos a los 6 s o al cerrarlos). */
export function useNotices(timeoutMs = 6_000) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (tone: Notice['tone'], text: string) => {
      const id = nextId.current++;
      setNotices((current) => [...current.slice(-2), { id, tone, text }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), timeoutMs),
      );
    },
    [dismiss, timeoutMs],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return { notices, push, dismiss };
}

export interface StatusChange {
  order: StaffOrder;
  to: OrderStatus;
}

/**
 * Cambio de estado optimista: la tarjeta se mueve al instante y, si la API lo
 * rechaza, vuelve a su lugar. Un 409 significa que otro miembro del staff ya movió
 * el pedido: se avisa y se recarga el tablero con la verdad de la API.
 */
export function useUpdateOrderStatus(notify: (tone: Notice['tone'], text: string) => void) {
  const client = useApi();
  const queryClient = useQueryClient();
  const t = useT();

  return useMutation({
    mutationKey: UPDATE_STATUS_KEY,
    mutationFn: ({ order, to }: StatusChange) => updateOrderStatus(client, order.id, to),
    onMutate: async ({ order, to }) => {
      // Una recarga en vuelo pisaría el cambio optimista con datos viejos.
      await queryClient.cancelQueries({ queryKey: ACTIVE_ORDERS_QUERY_KEY });
      queryClient.setQueryData<StaffOrder[]>(
        ACTIVE_ORDERS_QUERY_KEY,
        (current) => current && applyStatus(current, order.id, to),
      );
    },
    onSuccess: (updated, { order }) => {
      queryClient.setQueryData<StaffOrder[]>(
        ACTIVE_ORDERS_QUERY_KEY,
        (current) => current && upsertOrder(current, updated),
      );
      if (updated.status === 'cancelled') {
        notify(
          'info',
          order.pointsRedeemed > 0
            ? t('notice.cancelledPoints', { code: order.code, count: order.pointsRedeemed })
            : t('notice.cancelled', { code: order.code }),
        );
      }
    },
    onError: (error, { order }) => {
      // Rollback de ESTA tarjeta solamente: otras pueden tener cambios en vuelo.
      queryClient.setQueryData<StaffOrder[]>(
        ACTIVE_ORDERS_QUERY_KEY,
        (current) => current && upsertOrder(current, order),
      );
      if (error instanceof ApiError && error.status === 409) {
        notify('warning', t('notice.conflict', { code: order.code }));
      } else {
        notify('error', t('notice.failed', { code: order.code, message: describeError(error, t) }));
      }
    },
    onSettled: () => {
      // Con otros cambios todavía en vuelo, la recarga los pisaría: la hace el último.
      if (queryClient.isMutating({ mutationKey: UPDATE_STATUS_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
      }
    },
  });
}

/** Ids de los pedidos con un cambio de estado en vuelo (sus botones se deshabilitan). */
export function usePendingOrderIds(): Set<string> {
  const ids = useMutationState({
    filters: { mutationKey: UPDATE_STATUS_KEY, status: 'pending' },
    select: (mutation: Mutation<unknown, Error, unknown, unknown>) =>
      (mutation.state.variables as StatusChange | undefined)?.order.id,
  });
  return new Set(ids.filter((id): id is string => Boolean(id)));
}
