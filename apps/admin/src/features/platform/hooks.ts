import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingSummarySchema,
  funnelReportSchema,
  planSchema,
  platformTenantPageSchema,
  type BillingSummary,
  type ChangePlanInput,
  type FunnelReport,
  type PaymentResolution,
  type Plan,
  type PlatformTenant,
  type PlatformTenantPage,
  type SubscriptionStatus,
} from '@ventea/shared';

import { panelTenantDetailSchema, type PanelTenantDetail } from '@/lib/billing-schemas';

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
  summary: ['platform', 'tenants', 'summary'] as const,
  funnel: (days: number) => ['platform', 'funnel', days] as const,
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
      client.request<PanelTenantDetail>(`/platform/tenants/${encodeURIComponent(slug)}`, {
        schema: panelTenantDetailSchema,
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

/** `GET /api/platform/billing/summary`: MRR, marcas por estado, cobros sin resolver, alertas. */
export function useBillingSummary() {
  const { client } = usePlatform();
  return useQuery({
    queryKey: platformKeys.summary,
    queryFn: ({ signal }) =>
      client.request<BillingSummary>('/platform/billing/summary', {
        schema: billingSummarySchema,
        signal,
      }),
  });
}

/** `GET /api/platform/analytics/funnel?days=`: embudo de registro de la landing. */
export function useFunnel(days: number) {
  const { client } = usePlatform();
  return useQuery({
    queryKey: platformKeys.funnel(days),
    queryFn: ({ signal }) =>
      client.request<FunnelReport>(`/platform/analytics/funnel?days=${days}`, {
        schema: funnelReportSchema,
        signal,
      }),
  });
}

export type TenantAction =
  | { kind: 'suspend'; reason?: string }
  | { kind: 'reactivate' }
  | { kind: 'change-plan'; input: ChangePlanInput }
  | { kind: 'extend-trial'; days: number }
  | { kind: 'record-payment'; amountCents: number; reference: string }
  | { kind: 'resolve-payment'; orderId: string; outcome: PaymentResolution; note?: string };

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
    case 'resolve-payment':
      return { orderId: action.orderId, outcome: action.outcome, note: action.note || undefined };
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
      // Todas devuelven el detalle; si no se puede leer, se recarga.
      const parsed = panelTenantDetailSchema.safeParse(response);
      return parsed.success ? parsed.data : null;
    },
    onSuccess: async (detail) => {
      if (detail) queryClient.setQueryData(platformKeys.detail(slug), detail);
      else await queryClient.invalidateQueries({ queryKey: platformKeys.detail(slug) });
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    },
  });
}
