import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IDEMPOTENCY_KEY_HEADER,
  rewardCatalogItemSchema,
  rewardCustomerDetailSchema,
  rewardCustomersPageSchema,
  staffRewardsSchema,
  type RewardAdjustmentInput,
  type RewardCatalogInput,
  type RewardCatalogItem,
  type RewardCustomerDetail,
  type RewardCustomersPage,
  type StaffRewards,
  type UpdateRewardProgramInput,
} from '@ventea/shared';

import { useApi } from '@/app/services';
import { TENANT_QUERY_KEY } from '@/app/tenant';

export const REWARDS_QUERY_KEY = ['staff-rewards'] as const;
const CUSTOMERS_KEY = ['staff-rewards', 'customers'] as const;
const customerKey = (id: string) => ['staff-rewards', 'customer', id] as const;

/** Programa y catálogo (`GET /api/staff/rewards`): solo el dueño. */
export function useRewards(enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: REWARDS_QUERY_KEY,
    enabled,
    queryFn: ({ signal }) =>
      client.request<StaffRewards>('/staff/rewards', { schema: staffRewardsSchema, signal }),
  });
}

/**
 * Tras cambiar programa o catálogo se recarga también `GET /api/tenant`: es lo que lee la app
 * (y la vista previa de Mi marca).
 */
function useRefreshRewards() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: REWARDS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TENANT_QUERY_KEY }),
    ]);
  };
}

export function useUpdateProgram() {
  const client = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRewardProgramInput) =>
      client.request<StaffRewards>('/staff/rewards/program', {
        method: 'PUT',
        body: input,
        schema: staffRewardsSchema,
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(REWARDS_QUERY_KEY, data);
      await queryClient.invalidateQueries({ queryKey: TENANT_QUERY_KEY });
    },
  });
}

export function useSaveReward() {
  const client = useApi();
  const refresh = useRefreshRewards();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: RewardCatalogInput }) =>
      client.request<RewardCatalogItem>(
        id ? `/staff/rewards/catalog/${encodeURIComponent(id)}` : '/staff/rewards/catalog',
        { method: id ? 'PUT' : 'POST', body: input, schema: rewardCatalogItemSchema },
      ),
    onSuccess: refresh,
  });
}

export function useDeleteReward() {
  const client = useApi();
  const refresh = useRefreshRewards();
  return useMutation({
    mutationFn: (id: string) =>
      client.request<void>(`/staff/rewards/catalog/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: refresh,
  });
}

/** Clientes con su saldo. Mantiene la página anterior mientras llega la nueva (sin parpadeo). */
export function useRewardCustomers(q: string, page: number, enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, q, page],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set('q', q);
      return client.request<RewardCustomersPage>(`/staff/rewards/customers?${params}`, {
        schema: rewardCustomersPageSchema,
        signal,
      });
    },
  });
}

export function useRewardCustomer(id: string) {
  const client = useApi();
  return useQuery({
    queryKey: customerKey(id),
    queryFn: ({ signal }) =>
      client.request<RewardCustomerDetail>(`/staff/rewards/customers/${encodeURIComponent(id)}`, {
        schema: rewardCustomerDetailSchema,
        signal,
      }),
  });
}

/** Ajuste o canje: la respuesta es el detalle actualizado; la lista se recarga (saldos). */
function useCustomerMutation<TVars>(id: string, path: string) {
  const client = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    // `key`: Idempotency-Key del envío. Un reintento del mismo envío (timeout, red) la repite
    // y la API devuelve el movimiento ya hecho en vez de duplicarlo.
    mutationFn: ({ body, key }: { body: TVars; key: string }) =>
      client.request<RewardCustomerDetail>(
        `/staff/rewards/customers/${encodeURIComponent(id)}/${path}`,
        {
          method: 'POST',
          body,
          schema: rewardCustomerDetailSchema,
          headers: { [IDEMPOTENCY_KEY_HEADER]: key },
        },
      ),
    // En el hook y no en el `mutate()` del cajón: corre aunque el cajón ya se haya desmontado
    // (atrás del navegador con el envío en vuelo). Sin esto la clave quedaba guardada y una acción
    // nueva idéntica (un canje es `{rewardId}`) la reusaba: la API devolvía el movimiento viejo.
    onSuccess: (detail, { key }) => {
      releaseActionKey(key);
      queryClient.setQueryData(customerKey(id), detail);
      // Sin esperar: el panel del cliente ya tiene su saldo nuevo y no queda «guardando».
      void queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
    },
  });
}

/** Último envío sin éxito por acción y cliente; vive fuera del cajón (ver `actionKeys`). */
const pendingKeys = new Map<string, { payload: string; key: string }>();

/**
 * Clave de idempotencia por acción: la misma mientras se reintenta el mismo envío (mismos
 * datos, sin éxito todavía); una nueva al cambiar los datos o después de un éxito.
 *
 * Con `scope` (acción + cliente) el envío pendiente vive a nivel de módulo, no en el estado del
 * cajón: si el dueño lo cierra tras un timeout y lo reabre, el reintento con los mismos datos
 * lleva la misma clave y la API no duplica el ajuste. Se pierde al recargar la página. El éxito
 * la libera desde la mutación (`releaseActionKey`), no desde el cajón.
 */
export function actionKeys(scope?: string) {
  const store =
    scope === undefined ? new Map<string, { payload: string; key: string }>() : pendingKeys;
  const slot = scope ?? '';
  return {
    keyFor(payload: unknown): string {
      const text = JSON.stringify(payload);
      let last = store.get(slot);
      if (last?.payload !== text) {
        last = { payload: text, key: crypto.randomUUID() };
        store.set(slot, last);
      }
      return last.key;
    },
    done() {
      store.delete(slot);
    },
  };
}

/** El envío con esta clave salió bien: la próxima acción, aunque sea idéntica, lleva otra. */
export function releaseActionKey(key: string): void {
  for (const [slot, pending] of pendingKeys) {
    if (pending.key === key) pendingKeys.delete(slot);
  }
}

export const useAdjustPoints = (id: string) =>
  useCustomerMutation<RewardAdjustmentInput>(id, 'adjustments');
export const useRedeemReward = (id: string) =>
  useCustomerMutation<{ rewardId: string }>(id, 'redemptions');
