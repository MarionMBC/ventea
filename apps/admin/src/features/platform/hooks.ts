import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  planSchema,
  platformTenantDetailSchema,
  platformTenantPageSchema,
  type ChangePlanInput,
  type Plan,
  type PlatformTenant,
  type PlatformTenantDetail,
  type PlatformTenantPage,
  type SubscriptionStatus,
} from '@ventea/shared';

import { ApiError } from '@/lib/api';

import { usePlatform } from './services';

export const PAGE_SIZE = 25;
/** Tope de la API por página. */
const FETCH_ALL_PAGE_SIZE = 100;
/** Con filtros se traen todas las marcas: hasta 2000, de sobra para esta fase. */
const FETCH_ALL_MAX_PAGES = 20;

export const platformKeys = {
  all: ['platform'] as const,
  page: (page: number) => ['platform', 'tenants', 'page', page] as const,
  everything: ['platform', 'tenants', 'all'] as const,
  detail: (slug: string) => ['platform', 'tenant', slug] as const,
  plans: ['platform', 'plans'] as const,
  recordPayment: (slug: string) => ['platform', 'record-payment', slug] as const,
};

export type StatusFilter = SubscriptionStatus | 'all';

export interface TenantListView {
  items: PlatformTenant[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Lista de marcas. Sin filtros pagina en el servidor (`?page=&pageSize=25`). La API no
 * filtra por estado ni busca por slug todavía: con filtro o búsqueda se traen todas las
 * páginas (de a 100) y se filtra y pagina acá.
 */
export function useTenantList(page: number, status: StatusFilter, search: string) {
  const { client } = usePlatform();
  const filtering = status !== 'all' || search.trim() !== '';

  const serverPage = useQuery({
    queryKey: platformKeys.page(page),
    enabled: !filtering,
    queryFn: ({ signal }) =>
      client.request<PlatformTenantPage>(`/platform/tenants?page=${page}&pageSize=${PAGE_SIZE}`, {
        schema: platformTenantPageSchema,
        signal,
      }),
    placeholderData: (previous) => previous,
  });

  const everything = useQuery({
    queryKey: platformKeys.everything,
    enabled: filtering,
    queryFn: async ({ signal }) => {
      const items: PlatformTenant[] = [];
      for (let p = 1; p <= FETCH_ALL_MAX_PAGES; p++) {
        const chunk = await client.request<PlatformTenantPage>(
          `/platform/tenants?page=${p}&pageSize=${FETCH_ALL_PAGE_SIZE}`,
          { schema: platformTenantPageSchema, signal },
        );
        items.push(...chunk.items);
        if (items.length >= chunk.total || chunk.items.length === 0) break;
      }
      return items;
    },
  });

  const query = filtering ? everything : serverPage;
  let view: TenantListView | undefined;

  if (!filtering && serverPage.data) {
    const { items, total } = serverPage.data;
    view = { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  } else if (filtering && everything.data) {
    const needle = search.trim().toLowerCase();
    const matches = everything.data.filter(
      (tenant) =>
        (status === 'all' || tenant.subscription?.status === status) &&
        (!needle || tenant.slug.includes(needle) || tenant.name.toLowerCase().includes(needle)),
    );
    const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const current = Math.min(page, pageCount);
    view = {
      items: matches.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
      total: matches.length,
      page: current,
      pageCount,
    };
  }

  return { view, isPending: query.isPending, error: query.error, refetch: query.refetch };
}

export function useTenantDetail(slug: string) {
  const { client } = usePlatform();
  return useQuery({
    queryKey: platformKeys.detail(slug),
    queryFn: ({ signal }) =>
      client.request<PlatformTenantDetail>(`/platform/tenants/${encodeURIComponent(slug)}`, {
        schema: platformTenantDetailSchema,
        signal,
      }),
  });
}

const plansSchema = {
  parse: (data: unknown): Plan[] =>
    Array.isArray(data) ? data.map((plan) => planSchema.parse(plan)) : [],
};

export function usePlans() {
  const { client } = usePlatform();
  return useQuery({
    queryKey: platformKeys.plans,
    queryFn: ({ signal }) =>
      client.request<Plan[]>('/platform/plans', { auth: false, schema: plansSchema, signal }),
    staleTime: 10 * 60_000,
  });
}

/**
 * ¿Existe `POST …/record-payment` (llega con TASK-005)? Se sondea con un body vacío: si
 * la ruta existe, la validación responde `400` antes de llegar al handler (no escribe
 * nada); si no existe, Nest responde `404`. Cualquier otra cosa: oculto, por las dudas.
 */
export function useRecordPaymentAvailable(slug: string) {
  const { client } = usePlatform();
  return useQuery({
    queryKey: platformKeys.recordPayment(slug),
    queryFn: async () => {
      try {
        await client.request(`/platform/tenants/${encodeURIComponent(slug)}/record-payment`, {
          method: 'POST',
          body: {},
        });
        return true;
      } catch (error) {
        return error instanceof ApiError && error.status === 400;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export type TenantAction =
  | { kind: 'suspend'; reason?: string }
  | { kind: 'reactivate' }
  | { kind: 'change-plan'; input: ChangePlanInput }
  | { kind: 'extend-trial'; days: number }
  | { kind: 'record-payment'; amountCents: number; reference: string };

function bodyOf(action: TenantAction): unknown {
  switch (action.kind) {
    case 'suspend':
      return action.reason ? { reason: action.reason } : {};
    case 'reactivate':
      return undefined;
    case 'change-plan':
      return action.input;
    case 'extend-trial':
      return { days: action.days };
    case 'record-payment':
      return { amountCents: action.amountCents, reference: action.reference };
  }
}

/** Acciones sobre una marca. La respuesta (detalle actualizado) reemplaza al cacheado. */
export function useTenantAction(slug: string) {
  const { client } = usePlatform();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: TenantAction) => {
      const response = await client.request<unknown>(
        `/platform/tenants/${encodeURIComponent(slug)}/${action.kind}`,
        { method: 'POST', body: bodyOf(action) },
      );
      // record-payment (TASK-005) puede no devolver el detalle: entonces se recarga.
      const parsed = platformTenantDetailSchema.safeParse(response);
      return parsed.success ? parsed.data : null;
    },
    onSuccess: async (detail) => {
      if (detail) queryClient.setQueryData(platformKeys.detail(slug), detail);
      else await queryClient.invalidateQueries({ queryKey: platformKeys.detail(slug) });
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}
