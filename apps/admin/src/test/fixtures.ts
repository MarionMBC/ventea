import type { PublicTenant, StaffAuthResponse, StaffOrder } from '@ventea/shared';
import { vi } from 'vitest';

/** Datos y API falsa para los tests del panel. Nada de red real. */

let seq = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function makeOrder(overrides: Partial<StaffOrder> = {}): StaffOrder {
  seq += 1;
  return {
    id: uuid(seq),
    code: `CHC-${1000 + seq}`,
    status: 'confirmed',
    paymentStatus: 'pending',
    fulfillmentType: 'pickup',
    locationId: uuid(9000),
    lines: [
      {
        id: uuid(5000 + seq),
        menuItemId: uuid(7000),
        nameSnapshot: 'Reaper Tender Sandwich',
        quantity: 2,
        unitPriceCents: 1290,
        totalCents: 2580,
        selectedOptions: [{ id: uuid(8000), nameSnapshot: 'Hot', priceDeltaCents: 0 }],
        notes: null,
      },
    ],
    subtotalCents: 2580,
    discountCents: 0,
    taxCents: 0,
    totalCents: 2580,
    pointsEarned: 0,
    pointsRedeemed: 0,
    placedAt: new Date(Date.now() - 3 * 60_000),
    scheduledFor: null,
    customer: { firstName: 'Ana', lastName: 'Pérez', phone: '+504 9999-0000' },
    customerNotes: null,
    ...overrides,
  };
}

export const TENANT: PublicTenant = {
  slug: 'carolina-hot-chicken',
  name: 'Carolina Hot Chicken',
  currency: 'USD',
  branding: {
    primaryColor: '#E23B2E',
    secondaryColor: '#1F1D1B',
    logoUrl: null,
    appDisplayName: 'Carolina Hot Chicken',
  },
  rewardProgram: {
    isEnabled: true,
    pointsPerCurrencyUnit: 1,
    redemptionValueCents: 1,
    minPointsToRedeem: 100,
    signupBonusPoints: 50,
  },
};

export const STAFF_SESSION: StaffAuthResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  staff: { id: uuid(4000), email: 'owner@chc.test', name: 'Marta López', role: 'owner' },
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function apiError(status: number, message: string): Response {
  return json({ statusCode: status, message, error: 'Error' }, status);
}

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

export type Handler = (
  request: FakeRequest,
) => Response | undefined | Promise<Response | undefined>;

/**
 * `fetch` falso con estado: sirve `/api/tenant` y `/api/staff/orders` a partir de
 * `orders`, y aplica los PATCH. `override` intercepta antes (errores, demoras).
 */
export function createFakeApi(initial: StaffOrder[] = []) {
  const state = { orders: [...initial] };
  const calls: FakeRequest[] = [];
  let override: Handler | undefined;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const request: FakeRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(request);

    const overridden = await override?.(request);
    if (overridden) return overridden;

    if (request.path === '/api/tenant') return json(TENANT);
    if (request.method === 'GET' && request.path === '/api/staff/orders') {
      const status = request.query.get('status');
      return json(state.orders.filter((order) => !status || order.status === status));
    }
    const patch = request.path.match(/^\/api\/staff\/orders\/([^/]+)\/status$/);
    if (request.method === 'PATCH' && patch) {
      const order = state.orders.find((o) => o.id === patch[1]);
      if (!order) return apiError(404, 'Pedido no encontrado');
      Object.assign(order, { status: (request.body as { status: StaffOrder['status'] }).status });
      return json(order);
    }
    return apiError(404, `Ruta falsa no definida: ${request.method} ${request.path}`);
  });

  return {
    state,
    calls,
    fetch: fetchMock as unknown as typeof fetch,
    setOverride(handler: Handler | undefined) {
      override = handler;
    },
    count: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path).length,
  };
}
