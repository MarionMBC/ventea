import type { PlatformTenant, PlatformTenantDetail, SubscriptionStatus } from '@ventea/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { apiError, json } from '@/test/fixtures';

import { createPlatformClient } from './client';
import { isPlatformHost, isPlatformPath } from './host';
import { formatUsdCents } from './labels';
import { createPlatformSessionStore, PLATFORM_SESSION_KEY, type PlatformSession } from './session';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 24 * 60 * 60 * 1000;

/** JWT de mentira con `exp` (el cliente lo lee para no usar un token vencido). */
function fakeJwt(expMs: number): string {
  const payload = btoa(
    JSON.stringify({ sub: 'x', kind: 'platform', exp: Math.floor(expMs / 1000) }),
  );
  return `h.${payload.replace(/=+$/, '')}.s`;
}

const PLANS = [
  {
    code: 'pro',
    name: 'Pro',
    priceMonthlyCents: 5900,
    priceYearlyCents: 59000,
    currency: 'USD',
    maxLocations: 3,
    features: { brandedApp: true, customDomain: true, reports: false, prioritySupport: false },
  },
];

const SUMMARY = {
  currency: 'USD',
  mrrCents: 123400,
  byStatus: { trialing: 5, active: 3, past_due: 0, suspended: 1, canceled: 0 },
  failuresLast7Days: 1,
  unresolvedPayments: 2,
  alertsLast7Days: 0,
};

const zeros = {
  visit: 0,
  cta_click: 0,
  signup_start: 0,
  signup_step_2: 0,
  signup_step_3: 0,
  signup_complete: 0,
};
const FUNNEL = {
  timezone: 'America/Tegucigalpa',
  days: [
    {
      day: '2026-10-08',
      counts: {
        visit: 120,
        cta_click: 30,
        signup_start: 25,
        signup_step_2: 18,
        signup_step_3: 12,
        signup_complete: 6,
      },
    },
    { day: '2026-10-07', counts: zeros },
  ],
  totals: {
    visit: 120,
    cta_click: 30,
    signup_start: 25,
    signup_step_2: 18,
    signup_step_3: 12,
    signup_complete: 6,
  },
};

const SESSION: PlatformSession = {
  accessToken: fakeJwt(Date.now() + 60 * 60 * 1000),
  admin: { id: uuid(1), email: 'mario@ventea.tech', name: 'Mario' },
};

function makeTenant(n: number, status: SubscriptionStatus = 'trialing'): PlatformTenantDetail {
  const created = new Date(Date.UTC(2026, 9, 8) - n * DAY);
  return {
    id: uuid(100 + n),
    slug: `marca-${String(n).padStart(2, '0')}`,
    name: `Marca ${n}`,
    region: 'hn-1',
    createdVia: 'signup',
    isActive: true,
    createdAt: created,
    ordersLast30Days: n,
    subscription: {
      status,
      planCode: 'pro',
      interval: 'month',
      trialEndsAt: new Date(created.getTime() + 14 * DAY),
      currentPeriodStart: created,
      currentPeriodEnd: new Date(created.getTime() + 14 * DAY),
      cancelAtPeriodEnd: false,
    },
    card: null,
    openAttempts: [],
    activeLocations: 1,
    billingEvents: [
      { type: 'trial_started', amountCents: null, status: null, message: null, createdAt: created },
    ],
  };
}

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  auth?: string;
  body: unknown;
}

/** API de plataforma falsa con estado: lista, detalle y transiciones. */
function createFakePlatformApi(count = 30) {
  const tenants = Array.from({ length: count }, (_, i) =>
    makeTenant(i + 1, i % 5 === 0 ? 'active' : 'trialing'),
  );
  const calls: Call[] = [];
  let override: ((call: Call) => Response | undefined) | undefined;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const overridden = override?.(call);
    if (overridden) return overridden;

    if (call.path === '/api/platform/auth/login') {
      const body = call.body as { password: string };
      return body.password === 'clave-correcta'
        ? json(SESSION)
        : apiError(401, 'Credenciales inválidas');
    }
    if (call.path === '/api/platform/plans') return json(PLANS);
    if (call.auth !== `Bearer ${SESSION.accessToken}`) return apiError(401, 'Unauthorized');

    if (call.path === '/api/platform/billing/summary') return json(SUMMARY);
    if (call.path === '/api/platform/analytics/funnel') return json(FUNNEL);
    if (call.method === 'GET' && call.path === '/api/platform/tenants') {
      const page = Number(call.query.get('page') ?? 1);
      const pageSize = Number(call.query.get('pageSize') ?? 50);
      const items = tenants.slice((page - 1) * pageSize, page * pageSize);
      return json({ items: items.map(listItem), total: tenants.length, page, pageSize });
    }
    const match = call.path.match(/^\/api\/platform\/tenants\/([^/]+)(?:\/([a-z-]+))?$/);
    const tenant = match && tenants.find((t) => t.slug === match[1]);
    if (!match || !tenant) return apiError(404, 'Tenant no encontrado');
    const action = match[2];
    if (!action) return json(tenant);
    const sub = tenant.subscription!;
    switch (action) {
      case 'suspend':
        sub.status = 'suspended';
        tenant.billingEvents.unshift({
          type: 'suspended',
          amountCents: null,
          status: null,
          message: `Suspendida por mario@ventea.tech${(call.body as { reason?: string }).reason ? ` — ${(call.body as { reason: string }).reason}` : ''}`,
          createdAt: new Date(),
        });
        return json(tenant);
      case 'reactivate':
        sub.status = 'active';
        tenant.billingEvents.unshift({
          type: 'reactivated',
          amountCents: null,
          status: null,
          message: 'Reactivada por mario@ventea.tech',
          createdAt: new Date(),
        });
        return json(tenant);
      case 'record-payment':
        sub.status = 'active';
        tenant.billingEvents.unshift({
          type: 'payment_succeeded',
          amountCents: (call.body as { amountCents: number }).amountCents,
          status: null,
          message: `Pago manual (${(call.body as { reference: string }).reference})`,
          createdAt: new Date(),
        });
        return json(tenant);
      case 'resolve-payment':
        tenant.openAttempts = [];
        tenant.billingEvents.unshift({
          type: 'payment_succeeded',
          amountCents: 5900,
          status: null,
          message: 'Renovación confirmada a mano',
          createdAt: new Date(),
        });
        return json(tenant);
      default:
        return apiError(404, `Cannot POST ${call.path}`);
    }
  });

  return {
    tenants,
    calls,
    fetch: fetchMock as unknown as typeof fetch,
    setOverride(handler: typeof override) {
      override = handler;
    },
  };
}

function listItem(tenant: PlatformTenantDetail): PlatformTenant {
  const { activeLocations: _a, billingEvents: _b, card: _c, openAttempts: _o, ...rest } = tenant;
  return rest;
}

function renderPlatform(
  path: string,
  options: {
    loggedIn?: boolean;
    count?: number;
    hostname?: string;
    /** Prepara la API falsa antes del primer render. */
    before?: (api: ReturnType<typeof createFakePlatformApi>) => void;
  } = {},
) {
  const { loggedIn = true, count, hostname, before } = options;
  const api = createFakePlatformApi(count);
  before?.(api);
  const platformSession = createPlatformSessionStore(null);
  if (loggedIn) platformSession.set(SESSION);
  const platform = {
    session: platformSession,
    client: createPlatformClient({ session: platformSession, fetch: api.fetch }),
  };
  const staffSession = createSessionStore(null);
  const services = {
    session: staffSession,
    client: createApiClient({ session: staffSession, fetch: api.fetch }),
  };
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', path);
  render(
    <App services={services} platform={platform} queryClient={queryClient} hostname={hostname} />,
  );
  return { api, platformSession, queryClient };
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

afterEach(() => {
  document.title = '';
});

describe('sesión de plataforma', () => {
  it('usa su propia key, separada de la del staff', () => {
    const store = createPlatformSessionStore(window.localStorage);
    store.set(SESSION);
    expect(window.localStorage.getItem(PLATFORM_SESSION_KEY)).toContain(SESSION.accessToken);
    expect(window.localStorage.getItem('ventea.admin.session')).toBeNull();
  });

  it('descarta un token vencido al leerlo', () => {
    let now = Date.now();
    const store = createPlatformSessionStore(null, () => now);
    store.set({ ...SESSION, accessToken: fakeJwt(now + 1000) });
    expect(store.get()).not.toBeNull();
    now += 2000;
    expect(store.get()).toBeNull();
    expect(store.wasExpired()).toBe(true);
  });

  it('el cliente manda Bearer, nunca X-Tenant-Slug, y ante un 401 borra la sesión', async () => {
    const session = createPlatformSessionStore(null);
    session.set(SESSION);
    const fetchMock = vi.fn(() => Promise.resolve(apiError(401, 'Token inválido')));
    const client = createPlatformClient({ session, fetch: fetchMock as unknown as typeof fetch });

    await expect(client.request('/platform/tenants')).rejects.toMatchObject({ status: 401 });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${SESSION.accessToken}` });
    expect(init.headers).not.toHaveProperty('x-tenant-slug');
    expect(session.get()).toBeNull();
    expect(session.wasExpired()).toBe(true);
  });
});

describe('host del panel de plataforma', () => {
  it('solo app.<dominio> y localhost (el apex ya no: redirige a app.)', () => {
    expect(isPlatformHost('app.ventea.tech')).toBe(true);
    expect(isPlatformHost('APP.VENTEA.TECH.')).toBe(true);
    expect(isPlatformHost('localhost')).toBe(true);
    expect(isPlatformHost('ventea.tech')).toBe(false);
    expect(isPlatformHost('www.ventea.tech')).toBe(false);
    expect(isPlatformHost('pollos-juan.ventea.tech')).toBe(false);
    expect(isPlatformHost('app.ventea.tech.evil.com')).toBe(false);
  });

  it('en el subdominio de una marca no monta el login: manda a app.', async () => {
    const { api } = renderPlatform('/admin/plataforma', {
      loggedIn: false,
      hostname: 'pollos-juan.ventea.tech',
    });
    expect(await screen.findByRole('heading', { name: /no está acá/ })).toBeTruthy();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://app.ventea.tech/admin/plataforma',
    );
    expect(api.calls).toHaveLength(0);
  });
});

describe('panel de plataforma (AC3)', () => {
  it('sin sesión pide login; con credenciales correctas entra a la lista', async () => {
    const { api, platformSession } = renderPlatform('/admin/plataforma', { loggedIn: false });

    expect(await screen.findByRole('heading', { name: 'Plataforma' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'mario@ventea.tech' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'mala' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Credenciales inválidas');

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave-correcta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Marcas' })).toBeTruthy();
    expect(platformSession.get()?.admin.email).toBe('mario@ventea.tech');
    const login = api.calls.find((c) => c.path === '/api/platform/auth/login');
    expect(login?.auth).toBeUndefined();
  });

  it('lista paginada en el servidor con plan, estado, región, pedidos y fin de prueba', async () => {
    const { api } = renderPlatform('/admin/plataforma', { count: 30 });

    await screen.findByText('30 marcas');
    expect(rows()).toHaveLength(25);
    const first = rows()[0]!;
    expect(within(first).getByRole('link', { name: 'Marca 1' }).getAttribute('href')).toBe(
      '/admin/plataforma/marcas/marca-01',
    );
    expect(first.textContent).toContain('Pro mensual');
    expect(first.textContent).toContain('Activa');
    expect(first.textContent).toContain('hn-1');
    expect(first.textContent).toContain('Fin de período'); // activa
    expect(rows()[1]!.textContent).toContain('En prueba');
    expect(rows()[1]!.textContent).toContain('Fin de prueba');
    expect(screen.getByText('Página 1 de 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 2');
    await waitFor(() => expect(rows()).toHaveLength(5));
    const pages = api.calls
      .filter((c) => c.path === '/api/platform/tenants')
      .map((c) => `${c.query.get('page')}/${c.query.get('pageSize')}`);
    expect(pages).toEqual(['1/25', '2/25']);
  });

  it('filtra por estado y busca por slug', async () => {
    renderPlatform('/admin/plataforma', { count: 30 });
    await screen.findByText('30 marcas');

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'active' } });
    await screen.findByText('6 marcas');
    expect(rows().every((row) => row.textContent?.includes('Activa'))).toBe(true);

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar por slug o nombre'), {
      target: { value: 'marca-1' },
    });
    await screen.findByText('10 marcas'); // marca-10 … marca-19
    expect(rows().every((row) => row.textContent?.includes('marca-1'))).toBe(true);
  });

  it('detalle: datos, suscripción y eventos; suspender y reactivar con confirmación', async () => {
    const { api } = renderPlatform('/admin/plataforma/marcas/marca-02');

    expect(await screen.findByRole('heading', { level: 1, name: 'Marca 2' })).toBeTruthy();
    expect(screen.getByText('marca-02.ventea.tech')).toBeTruthy();
    expect(screen.getByText('Prueba iniciada')).toBeTruthy();
    expect(screen.getByText('Sin tarjeta')).toBeTruthy();
    // Sin sondeo: «Registrar pago» está siempre y no se llama al endpoint al abrir.
    expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeTruthy();
    expect(api.calls.some((c) => c.path.endsWith('/record-payment'))).toBe(false);
    // Sin intentos abiertos no hay nada que resolver (aunque haya eventos de cobro).
    expect(screen.queryByRole('button', { name: 'Resolver cobro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();

    // Suspender: pide confirmación; cancelar no llama a la API.
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    let dialog = screen.getByRole('dialog', { name: '¿Suspender Marca 2?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.calls.some((c) => c.path.endsWith('/suspend'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    dialog = screen.getByRole('dialog', { name: '¿Suspender Marca 2?' });
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), {
      target: { value: 'falta de pago' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));

    expect((await screen.findByRole('status')).textContent).toBe('Marca suspendida.');
    expect(screen.queryByRole('dialog')).toBeNull();
    const suspend = api.calls.find((c) => c.path === '/api/platform/tenants/marca-02/suspend');
    expect(suspend).toMatchObject({ method: 'POST', body: { reason: 'falta de pago' } });
    expect(screen.getAllByText('Suspendida').length).toBeGreaterThan(0);
    expect(screen.getByText(/falta de pago/)).toBeTruthy();

    // Reactivar.
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));
    dialog = screen.getByRole('dialog', { name: '¿Reactivar Marca 2?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reactivar' }));
    expect((await screen.findByRole('status')).textContent).toContain('Marca reactivada');
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeTruthy();
    expect(api.tenants[1]!.subscription!.status).toBe('active');
  });

  it('Escape cierra el diálogo sin aplicar la acción', async () => {
    const { api } = renderPlatform('/admin/plataforma/marcas/marca-02');
    fireEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.calls.some((c) => c.path.endsWith('/suspend'))).toBe(false);
  });

  it('un error de la acción se muestra en el diálogo', async () => {
    const { api } = renderPlatform('/admin/plataforma/marcas/marca-02');
    api.setOverride((c) =>
      c.path.endsWith('/suspend')
        ? apiError(409, 'No se puede suspender una suscripción en estado suspended')
        : undefined,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspender' }));
    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent).toContain(
      'No se puede suspender',
    );
  });

  it('registrar pago: precarga el precio del plan, pide referencia y confirma', async () => {
    const { api } = renderPlatform('/admin/plataforma/marcas/marca-02');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const dialog = screen.getByRole('dialog', { name: 'Registrar pago manual' });
    expect(dialog.textContent).toContain('Estas notas son internas, el cliente no las ve.');
    const amount = within(dialog).getByLabelText('Monto (USD)') as HTMLInputElement;
    await waitFor(() => expect(amount.value).toBe('59.00')); // Pro mensual
    fireEvent.change(within(dialog).getByLabelText(/Referencia/), {
      target: { value: 'TRF-123' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));

    expect((await screen.findByRole('status')).textContent).toContain('Pago registrado');
    const call = api.calls.find((c) => c.path.endsWith('/record-payment'));
    expect(call?.body).toEqual({ amountCents: 5900, reference: 'TRF-123' });
    expect(screen.getAllByText('Pago recibido').length).toBeGreaterThan(0);
  });

  it('registrar pago con un cobro en curso: muestra el 409 en el diálogo', async () => {
    const { api } = renderPlatform('/admin/plataforma/marcas/marca-02');
    api.setOverride((c) =>
      c.path.endsWith('/record-payment')
        ? apiError(409, 'Hay un cobro con tarjeta sin confirmar: resuélvelo primero')
        : undefined,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pago' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Monto (USD)'), { target: { value: '59' } });
    fireEvent.change(within(dialog).getByLabelText(/Referencia/), { target: { value: 'x' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'cobro con tarjeta sin confirmar',
    );
  });

  it('resolver cobro: solo con intentos abiertos; precarga el orderId del intento', async () => {
    const { api } = renderPlatform('/admin/plataforma/marcas/marca-03');
    api.tenants[2]!.card = { brand: 'visa', last4: '4242' };
    api.tenants[2]!.billingEvents.unshift({
      type: 'payment_unknown',
      amountCents: 5900,
      status: 'unknown',
      message: 'Cobro sin confirmar',
      createdAt: new Date(),
    });
    api.tenants[2]!.openAttempts = [
      {
        orderId: 'sub-abc-20261008-a1',
        kind: 'renewal',
        status: 'unknown',
        amountCents: 5900,
        createdAt: new Date(),
      },
    ];
    // Recarga el detalle con el evento nuevo.
    fireEvent.click(await screen.findByRole('link', { name: '← Marcas' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Marca 3' }));
    await screen.findByText('visa ••••4242');
    expect(screen.getByText('Cobro sin confirmar')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Resolver cobro' }));
    const dialog = screen.getByRole('dialog', { name: 'Resolver cobro sin confirmar' });
    expect((within(dialog).getByLabelText('Cobro abierto') as HTMLSelectElement).value).toBe(
      'sub-abc-20261008-a1',
    );
    expect(dialog.textContent).toContain('Estas notas son internas, el cliente no las ve.');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Se cobró/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolver' }));
    expect((await screen.findByRole('status')).textContent).toBe('Cobro resuelto.');
    expect(api.calls.find((c) => c.path.endsWith('/resolve-payment'))?.body).toEqual({
      orderId: 'sub-abc-20261008-a1',
      outcome: 'succeeded',
    });
  });

  it('un tipo de evento desconocido no rompe el detalle: «Evento: <tipo>»', async () => {
    renderPlatform('/admin/plataforma/marcas/marca-04', {
      before: (api) =>
        api.setOverride((c) => {
          if (c.path !== '/api/platform/tenants/marca-04') return undefined;
          const tenant = { ...api.tenants[3]!, card: undefined, openAttempts: undefined };
          return json({
            ...tenant,
            billingEvents: [
              {
                type: 'refund_issued',
                amountCents: 100,
                status: null,
                message: null,
                createdAt: new Date(),
              },
            ],
          });
        }),
    });
    expect(await screen.findByText('Evento: refund_issued')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Marca 4' })).toBeTruthy();
  });

  it('cabecera de la lista con el resumen de cobro', async () => {
    renderPlatform('/admin/plataforma');
    const bar = await screen.findByLabelText('Resumen de cobro');
    expect(bar.textContent).toContain('$1,234.00');
    expect(bar.textContent).toContain('Activa 3');
    expect(bar.textContent).toContain('Cobros sin resolver2');
  });

  it('token rechazado (401) en uso: vuelve al login avisando que expiró', async () => {
    const { api } = renderPlatform('/admin/plataforma');
    await screen.findByText('30 marcas');
    api.setOverride((c) =>
      c.path.startsWith('/api/platform/tenants') ? apiError(401, 'x') : undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect((await screen.findByRole('status')).textContent).toContain('Tu sesión expiró');
    expect(screen.getByRole('heading', { name: 'Plataforma' })).toBeTruthy();
  });
});

describe('embudo de registro (TASK-007 AC4)', () => {
  it('desde la cabecera: tabla por día con totales y conversión visita → registro', async () => {
    const { api } = renderPlatform('/admin/plataforma');
    await screen.findByRole('heading', { name: 'Marcas' });
    fireEvent.click(screen.getByRole('link', { name: 'Embudo de registro' }));

    expect(await screen.findByRole('heading', { name: 'Embudo de registro' })).toBeTruthy();
    const funnel = api.calls.find((c) => c.path === '/api/platform/analytics/funnel');
    expect(funnel?.query.get('days')).toBe('30');
    expect(funnel?.auth).toBe(`Bearer ${SESSION.accessToken}`);

    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers).toEqual([
      'Día',
      'Visitas',
      'Clic en «Probar»',
      'Abre el registro',
      'Paso 2',
      'Paso 3',
      'Registros',
    ]);
    const bodyRows = within(table).getAllByRole('row');
    // cabecera + 2 días + total
    expect(bodyRows).toHaveLength(4);
    expect(
      within(bodyRows[1]!)
        .getAllByRole('cell')
        .map((td) => td.textContent),
    ).toEqual(['120', '30', '25', '18', '12', '6']);
    expect(within(bodyRows[3]!).getByRole('rowheader').textContent).toBe('Total');

    const summary = screen.getByLabelText('Totales de 30 días');
    expect(summary.textContent).toContain('Conversión visita → registro5%');
    expect(summary.textContent).toContain('Abren el registro → completan24%');
  });
});

describe('Plataforma en español', () => {
  it('isPlatformPath: solo /admin/plataforma y lo que cuelga de ahí', () => {
    expect(isPlatformPath('/admin/plataforma', '/admin')).toBe(true);
    expect(isPlatformPath('/admin/plataforma/marcas/x', '/admin/')).toBe(true);
    expect(isPlatformPath('/admin/plataformas', '/admin')).toBe(false);
    expect(isPlatformPath('/admin/orders', '/admin')).toBe(false);
  });

  it('en la plataforma el panel queda en español aunque el idioma guardado sea inglés', async () => {
    window.localStorage.setItem('ventea.admin.lang', 'en');
    renderPlatform('/admin/plataforma/login', { loggedIn: false });
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(document.documentElement.lang).toBe('es');
  });

  it('formatUsdCents respeta el locale', () => {
    expect(formatUsdCents(123456)).toBe('$1,234.56');
    expect(formatUsdCents(123456, 'en-US')).toBe('$1,234.56');
    expect(formatUsdCents(123456, 'de-DE')).toBe('1.234,56 $');
  });
});

describe('apps de las marcas', () => {
  const PEM = '-----BEGIN PRIVATE KEY-----\nSECRETO-NO-MOSTRAR\n-----END PRIVATE KEY-----\n';
  const SERVICE_ACCOUNT = JSON.stringify({
    type: 'service_account',
    project_id: 'marca-01-app',
    private_key_id: 'abc',
    private_key: PEM,
    client_email: 'fcm@marca-01-app.iam.gserviceaccount.com',
  });

  function appState() {
    return {
      tenant: { slug: 'marca-01', name: 'Marca 1', planCode: 'pro' },
      exists: true,
      bundleId: 'app.ventea.marca01',
      publisher: 'ventea',
      status: 'requested',
      version: null,
      buildNumber: null,
      storeUrls: { android: null, ios: null },
      requestedAt: '2026-10-09T12:00:00.000Z',
      push: { configured: false, projectId: null, updatedAt: null } as {
        configured: boolean;
        projectId: string | null;
        updatedAt: string | null;
      },
      events: [
        {
          type: 'requested',
          actor: 'owner@marca.test',
          message: null,
          createdAt: '2026-10-09T12:00:00.000Z',
        },
      ],
    };
  }

  function withApps(api: ReturnType<typeof createFakePlatformApi>, failPut = () => false) {
    const app = appState();
    api.setOverride((call) => {
      if (call.method === 'PUT' && failPut()) return apiError(500, 'Error interno');
      if (call.path === '/api/platform/app-requests') {
        const status = call.query.get('status');
        const item = {
          slug: 'marca-01',
          name: 'Marca 1',
          planCode: 'pro',
          status: app.status,
          publisher: app.publisher,
          bundleId: app.bundleId,
          requestedAt: app.requestedAt,
          updatedAt: '2026-10-09T13:00:00.000Z',
        };
        return json(!status || status === app.status ? [item] : []);
      }
      if (call.path === '/api/platform/tenants/marca-01/app') {
        if (call.method === 'PATCH') {
          const body = call.body as Record<string, unknown>;
          Object.assign(app, body);
        }
        return json(app);
      }
      if (call.path === '/api/platform/tenants/marca-01/push-credentials') {
        app.push =
          call.method === 'PUT'
            ? {
                configured: true,
                projectId: (call.body as { project_id: string }).project_id,
                updatedAt: '2026-10-09T14:00:00.000Z',
              }
            : { configured: false, projectId: null, updatedAt: null };
        return json(app.push);
      }
      return undefined;
    });
    return app;
  }

  it('cola: las pendientes, con link a la app de la marca; filtro por estado', async () => {
    let api!: ReturnType<typeof createFakePlatformApi>;
    renderPlatform('/admin/plataforma/apps', { before: (a) => ((api = a), withApps(a)) });
    expect(await screen.findByRole('heading', { name: 'Apps de las marcas' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Marca 1' })).toBeTruthy();
    expect(screen.getByText('app.ventea.marca01')).toBeTruthy();
    expect(within(rows()[0]!).getByText('Solicitada')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'published' } });
    expect(await screen.findByText('Nada en la cola')).toBeTruthy();
    expect(api.calls.some((c) => c.query.get('status') === 'published')).toBe(true);
  });

  it('edita la AppConfig mandando solo lo cambiado y valida la versión', async () => {
    let api!: ReturnType<typeof createFakePlatformApi>;
    renderPlatform('/admin/plataforma/marcas/marca-01/app', {
      before: (a) => ((api = a), withApps(a)),
    });
    expect(await screen.findByRole('heading', { name: 'App de Marca 1' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Versión (X.Y.Z)'), { target: { value: '1.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText(/La versión va como X.Y.Z/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Versión (X.Y.Z)'), { target: { value: '1.0.0' } });
    fireEvent.change(screen.getAllByLabelText('Estado')[0]!, { target: { value: 'building' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('App actualizada.')).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      status: 'building',
      version: '1.0.0',
    });
  });

  it('credenciales push: se cargan, nunca se muestran y quedan como «Configurado»', async () => {
    let api!: ReturnType<typeof createFakePlatformApi>;
    renderPlatform('/admin/plataforma/marcas/marca-01/app', {
      before: (a) => ((api = a), withApps(a)),
    });
    expect(await screen.findByText('Sin configurar')).toBeTruthy();
    const area = screen.getByLabelText('Cargar credenciales') as HTMLTextAreaElement;
    expect(area.value).toBe('');

    fireEvent.change(area, { target: { value: '{no es json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales' }));
    expect(screen.getByText(/No es un JSON válido/)).toBeTruthy();

    fireEvent.change(area, { target: { value: SERVICE_ACCOUNT } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales' }));
    expect(await screen.findByText('Configurado')).toBeTruthy();
    expect(screen.getByText('marca-01-app')).toBeTruthy();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    // Solo los cuatro campos que la API acepta; nada extra del archivo.
    expect(Object.keys(put.body as object).sort()).toEqual([
      'client_email',
      'private_key',
      'project_id',
      'type',
    ]);
    expect((screen.getByLabelText('Reemplazar credenciales') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect(document.body.innerHTML).not.toContain('SECRETO-NO-MOSTRAR');

    fireEvent.click(screen.getByRole('button', { name: 'Borrar credenciales' }));
    const dialog = screen.getByRole('dialog', { name: '¿Borrar las credenciales push?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, borrar' }));
    expect(await screen.findByText('Sin configurar')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('la private_key no queda en la caché de react-query ni en el estado (OK y con error)', async () => {
    let fail = true;
    const { queryClient } = renderPlatform('/admin/plataforma/marcas/marca-01/app', {
      before: (a) => withApps(a, () => fail),
    });
    await screen.findByText('Sin configurar');
    const area = () => screen.getByLabelText(/credenciales/) as HTMLTextAreaElement;
    const leaks = () =>
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      ).includes('SECRETO-NO-MOSTRAR') ||
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ).includes('SECRETO-NO-MOSTRAR');

    fireEvent.change(area(), { target: { value: SERVICE_ACCOUNT } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales' }));
    expect(await screen.findByText(/Vuelve a pegar el JSON/)).toBeTruthy();
    expect(area().value).toBe('');
    expect(leaks()).toBe(false);

    fail = false;
    fireEvent.change(area(), { target: { value: SERVICE_ACCOUNT } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales' }));
    expect(await screen.findByText('Configurado')).toBeTruthy();
    expect(area().value).toBe('');
    expect(leaks()).toBe(false);
    expect(document.body.innerHTML).not.toContain('SECRETO-NO-MOSTRAR');
  });

  it('el detalle de la marca enlaza a su app', async () => {
    renderPlatform('/admin/plataforma/marcas/marca-01');
    expect(await screen.findByRole('link', { name: 'Ver app y push' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Apps' }).getAttribute('href')).toBe(
      '/admin/plataforma/apps',
    );
  });
});
