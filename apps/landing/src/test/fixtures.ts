import type { Plan } from '@ventea/shared';
import { vi } from 'vitest';

/** Planes como los siembra la migración (ADR 0007). */
export const PLANS: Plan[] = [
  {
    code: 'pro',
    name: 'Pro',
    priceMonthlyCents: 5900,
    priceYearlyCents: 59000,
    currency: 'USD',
    maxLocations: 3,
    features: { brandedApp: true, customDomain: true, reports: false, prioritySupport: false },
  },
  {
    code: 'basic',
    name: 'Básico',
    priceMonthlyCents: 2500,
    priceYearlyCents: 25000,
    currency: 'USD',
    maxLocations: 1,
    features: { brandedApp: false, customDomain: false, reports: false, prioritySupport: false },
  },
  {
    code: 'chain',
    name: 'Cadena',
    priceMonthlyCents: 12900,
    priceYearlyCents: 129000,
    currency: 'USD',
    maxLocations: null,
    features: { brandedApp: true, customDomain: true, reports: true, prioritySupport: true },
  },
];

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** `fetch` global falso: cada test decide qué responde cada URL. Nada de red real. */
export function mockFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve().then(() => handler(String(input), init ?? {})),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Llamadas a una ruta (sin query). */
export function callsTo(fetchMock: ReturnType<typeof mockFetch>, path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).split('?')[0] === `/api${path}`);
}

/** Texto visible de un elemento, con espacios normalizados (sin jest-dom). */
export function text(element: Node | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
