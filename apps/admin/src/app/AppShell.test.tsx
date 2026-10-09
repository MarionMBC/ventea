import type { StaffAuthResponse, StaffOrder } from '@ventea/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { urgencyOf } from '@/features/orders/OrderCard';
import { LANG_STORAGE_KEY } from '@/i18n';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import {
  apiError,
  createFakeApi,
  json,
  makeOrder,
  STAFF_SESSION,
  type Handler,
} from '@/test/fixtures';

import { App, createQueryClient } from './App';

function renderPanel(
  orders: StaffOrder[] = [],
  {
    path = '/admin/orders',
    role = 'owner',
    loggedIn = true,
    override,
  }: {
    path?: string;
    role?: StaffAuthResponse['staff']['role'];
    loggedIn?: boolean;
    override?: Handler;
  } = {},
) {
  const api = createFakeApi(orders);
  api.setOverride(override);
  const session = createSessionStore(null);
  if (loggedIn) session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', path);
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, session, queryClient };
}

const nav = () => screen.getByRole('navigation', { name: 'Dashboard sections' });

afterEach(() => {
  document.title = '';
  document.documentElement.lang = '';
});

describe('Shell del panel', () => {
  it('solo enlaza secciones que funcionan; las que faltan son «Coming soon» sin enlace', async () => {
    renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    const links = within(nav())
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(links).toEqual([
      'Orders',
      'History',
      'Menu',
      'Locations',
      'Reports',
      'Rewards',
      'My brand',
      'Team',
      'Billing',
    ]);
    expect(within(nav()).getByRole('link', { name: 'Orders' }).getAttribute('aria-current')).toBe(
      'page',
    );

    // Ya no queda nada «Próximamente» (TASK-022 + TASK-023).
    expect(within(nav()).queryByRole('list', { name: 'Coming soon' })).toBeNull();
  });

  it('muestra usuario, rol y «Powered by Ventea»; el staff no ve Facturación', async () => {
    renderPanel([makeOrder()], { role: 'staff' });
    await screen.findByText('Ana Pérez');
    expect(screen.getByText('Marta López')).toBeTruthy();
    expect(screen.getAllByText('Staff').length).toBeGreaterThan(0);
    expect(screen.getByText('Powered by Ventea')).toBeTruthy();
    expect(within(nav()).queryByRole('link', { name: 'Billing' })).toBeNull();
    expect(within(nav()).queryByRole('link', { name: 'My brand' })).toBeNull();
    expect(within(nav()).queryByRole('link', { name: 'Team' })).toBeNull();
    // Sucursales las ve todo el equipo (solo lectura para staff, TASK-022).
    expect(within(nav()).getByRole('link', { name: 'Locations' })).toBeTruthy();
    expect(within(nav()).queryByRole('link', { name: 'Reports' })).toBeNull();
    expect(within(nav()).queryByRole('link', { name: 'Rewards' })).toBeNull();
    // El menú lo ve todo el equipo (solo lectura para staff).
    expect(within(nav()).getByRole('link', { name: 'Menu' })).toBeTruthy();
    // Marca del tenant: nombre e inicial (sin logo).
    expect(screen.getAllByText('Carolina Hot Chicken').length).toBeGreaterThan(0);
  });

  it('el gerente ve Reportes pero no Puntos ni la facturación (TASK-023)', async () => {
    renderPanel([makeOrder()], { role: 'manager' });
    await screen.findByText('Ana Pérez');
    expect(within(nav()).getByRole('link', { name: 'Reports' })).toBeTruthy();
    expect(within(nav()).queryByRole('link', { name: 'Rewards' })).toBeNull();
    expect(within(nav()).queryByRole('link', { name: 'Billing' })).toBeNull();
  });

  it('el menú de móvil abre el cajón y Escape lo cierra', async () => {
    renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    const open = screen.getByRole('button', { name: 'Open menu' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.app--drawer-open')).toBeTruthy();
    // El fondo no scrollea con el cajón abierto (regla de layout, TASK-020).
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('la barra lateral es un panel de scroll propio, no un segundo scroll de la página', async () => {
    renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    expect(document.querySelector('#app-sidebar')?.hasAttribute('data-scroll-pane')).toBe(true);
  });

  it('la barra lateral se contrae y recuerda la elección', async () => {
    renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.app--collapsed')).toBeTruthy();
    expect(window.localStorage.getItem('ventea.admin.sidebar')).toBe('collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('la ruta vieja /staff lleva a Equipo (TASK-022)', async () => {
    renderPanel([], { path: '/admin/staff' });
    await waitFor(() => expect(window.location.pathname).toBe('/admin/team'));
  });
});

describe('Idioma', () => {
  it('inglés por defecto; el selector cambia a español, lo recuerda y actualiza <html lang>', async () => {
    renderPanel([makeOrder({ code: 'CHC-1000' })]);
    await screen.findByText('CHC-1000');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('region', { name: 'New' })).toBeTruthy();

    const [english] = screen.getAllByRole('button', { name: 'English' });
    expect(english!.getAttribute('aria-pressed')).toBe('true');
    act(() => fireEvent.click(screen.getAllByRole('button', { name: 'Español' })[0]!));

    expect(document.documentElement.lang).toBe('es');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('es');
    expect(screen.getByRole('region', { name: 'Nuevos' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'En cocina' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Listos' })).toBeTruthy();
    const navEs = screen.getByRole('navigation', { name: 'Secciones del panel' });
    expect(within(navEs).getByRole('link', { name: 'Pedidos' })).toBeTruthy();
    expect(within(navEs).getByRole('link', { name: 'Facturación' })).toBeTruthy();
    expect(within(navEs).getByRole('link', { name: 'Sucursales' })).toBeTruthy();
    const card = screen.getByTestId('order-CHC-1000');
    expect(within(card).getByRole('button', { name: 'Empezar' })).toBeTruthy();
    expect(within(card).getByText('Para llevar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(document.title).toBe('Pedidos · Carolina Hot Chicken');
  });

  it('respeta ?lang=es en la URL', async () => {
    renderPanel([makeOrder({ code: 'CHC-2000', status: 'ready', fulfillmentType: 'dine_in' })], {
      path: '/admin/orders?lang=es',
    });
    const card = await screen.findByTestId('order-CHC-2000');
    expect(within(card).getByRole('button', { name: 'Entregado' })).toBeTruthy();
    expect(within(card).getByText('Comer aquí')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Cancelar pedido CHC-2000' })).toBeTruthy();
  });

  it('una elección guardada se usa al volver a entrar', async () => {
    window.localStorage.setItem(LANG_STORAGE_KEY, 'es');
    renderPanel([], { loggedIn: false, path: '/admin/login' });
    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });

  it('el login tiene selector de idioma', async () => {
    renderPanel([], { loggedIn: false, path: '/admin/login' });
    expect(await screen.findByRole('heading', { name: 'Restaurant dashboard' })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe('Sign in · Carolina Hot Chicken'));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Español' })));
    expect(screen.getByRole('heading', { name: 'Panel del local' })).toBeTruthy();
    expect(screen.getByLabelText('Contraseña')).toBeTruthy();
  });

  it('historial en español: estados reales y totales', async () => {
    renderPanel(
      [
        makeOrder({ code: 'CHC-3001', status: 'completed' }),
        makeOrder({ code: 'CHC-3002', status: 'cancelled' }),
      ],
      { path: '/admin/orders/history?lang=es' },
    );
    expect(await screen.findByText('CHC-3001')).toBeTruthy();
    expect(screen.getByText('Entregado', { selector: '.status-chip' })).toBeTruthy();
    expect(screen.getByText('Cancelado', { selector: '.status-chip' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Historial de hoy' })).toBeTruthy();
  });
});

describe('Tarjeta: urgencia por tiempo', () => {
  it('ámbar y rojo según la columna', () => {
    expect(urgencyOf('confirmed', 4)).toBe('ok');
    expect(urgencyOf('confirmed', 5)).toBe('warn');
    expect(urgencyOf('confirmed', 10)).toBe('late');
    expect(urgencyOf('preparing', 14)).toBe('ok');
    expect(urgencyOf('preparing', 25)).toBe('late');
    expect(urgencyOf('ready', 12)).toBe('warn');
    expect(urgencyOf('completed', 90)).toBe('ok');
  });

  it('un pedido nuevo de hace 12 min se marca como demorado', async () => {
    renderPanel([makeOrder({ code: 'CHC-4000', placedAt: new Date(Date.now() - 12 * 60_000) })]);
    const card = await screen.findByTestId('order-CHC-4000');
    const timer = card.querySelector('.timer')!;
    expect(timer.classList.contains('timer--late')).toBe(true);
    expect(timer.textContent).toContain('12 min');
    expect(timer.textContent).toContain('Running late');
  });

  it('las notas del pedido y de cada producto se ven resaltadas', async () => {
    renderPanel([
      makeOrder({
        code: 'CHC-5000',
        customerNotes: 'Sin cebolla, por favor',
        lines: [{ ...makeOrder().lines[0]!, notes: 'bien cocido' }],
      }),
    ]);
    const card = await screen.findByTestId('order-CHC-5000');
    expect(within(card).getByText('Note: bien cocido').classList.contains('note')).toBe(true);
    expect(within(card).getByText('Order note:').closest('.note--order')).toBeTruthy();
  });
});

/** Facturación del dueño con pago pendiente en gracia: el marco muestra el aviso. */
function pastDueBilling(): Record<string, unknown> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    mode: 'manual',
    status: 'past_due',
    planCode: 'pro',
    planName: 'Pro',
    interval: 'month',
    price: { amountCents: 5900, currency: 'USD' },
    trialEndsAt: null,
    currentPeriodStart: new Date(now - 30 * day).toISOString(),
    currentPeriodEnd: new Date(now).toISOString(),
    cancelAtPeriodEnd: false,
    retryAt: null,
    graceEndsAt: new Date(now + 3 * day).toISOString(),
    pendingPlan: null,
    card: null,
    events: [],
  };
}

describe('Caché al perder la sesión', () => {
  it('cerrar sesión vacía TODA la caché: quien entra después no ve la facturación del dueño', async () => {
    const { api, session, queryClient } = renderPanel([makeOrder()], {
      override: (req) => (req.path === '/api/billing' ? json(pastDueBilling()) : undefined),
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(queryClient.getQueryData(['billing'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Restaurant dashboard' })).toBeTruthy();
    expect(queryClient.getQueryData(['billing'])).toBeUndefined();
    expect(queryClient.getQueryData(['orders', 'active'])).toBeUndefined();

    // Entra alguien del equipo en la misma pestaña.
    act(() => session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role: 'staff' } }));
    window.history.pushState({}, '', '/admin/orders');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(await screen.findByText('Ana Pérez')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.calls.filter((c) => c.path === '/api/billing')).toHaveLength(1);
  });

  it('un refresh rechazado también vacía la caché', async () => {
    const { api, session, queryClient } = renderPanel([makeOrder()], {
      override: (req) => (req.path === '/api/billing' ? json(pastDueBilling()) : undefined),
    });
    expect(await screen.findByRole('alert')).toBeTruthy();

    // El access token vence y el refresh token ya no sirve.
    api.setOverride((req) =>
      req.path === '/api/auth/refresh' || req.path === '/api/staff/orders'
        ? apiError(401, 'Unauthorized')
        : undefined,
    );
    await act(() => queryClient.refetchQueries({ queryKey: ['orders'] }));
    await waitFor(() => expect(session.get()).toBeNull());
    expect(queryClient.getQueryData(['billing'])).toBeUndefined();
    expect(await screen.findByRole('heading', { name: 'Restaurant dashboard' })).toBeTruthy();
  });
});
