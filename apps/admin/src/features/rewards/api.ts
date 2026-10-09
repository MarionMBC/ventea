import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
    mutationFn: (body: TVars) =>
      client.request<RewardCustomerDetail>(
        `/staff/rewards/customers/${encodeURIComponent(id)}/${path}`,
        { method: 'POST', body, schema: rewardCustomerDetailSchema },
      ),
    onSuccess: async (detail) => {
      queryClient.setQueryData(customerKey(id), detail);
      await queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
    },
  });
}

export const useAdjustPoints = (id: string) =>
  useCustomerMutation<RewardAdjustmentInput>(id, 'adjustments');
export const useRedeemReward = (id: string) =>
  useCustomerMutation<{ rewardId: string }>(id, 'redemptions');
