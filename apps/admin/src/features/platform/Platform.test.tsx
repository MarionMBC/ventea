import type { PlatformTenant, PlatformTenantDetail, SubscriptionStatus } from '@ventea/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { apiError, json } from '@/test/fixtures';

import { createPlatformClient } from './client';
import { isPlatformHost } from './host';
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
  return { api, platformSession };
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
  it('solo el apex y localhost', () => {
    expect(isPlatformHost('ventea.tech')).toBe(true);
    expect(isPlatformHost('VENTEA.TECH.')).toBe(true);
    expect(isPlatformHost('localhost')).toBe(true);
    expect(isPlatformHost('pollos-juan.ventea.tech')).toBe(false);
    expect(isPlatformHost('ventea.tech.evil.com')).toBe(false);
  });

  it('en el subdominio de una marca no monta el login: manda al apex', async () => {
    const { api } = renderPlatform('/admin/plataforma', {
      loggedIn: false,
      hostname: 'pollos-juan.ventea.tech',
    });
    expect(await screen.findByRole('heading', { name: /no está acá/ })).toBeTruthy();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://ventea.tech/admin/plataforma',
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
