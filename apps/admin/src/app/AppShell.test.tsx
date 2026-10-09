import type { StaffAuthResponse, StaffOrder } from '@ventea/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { urgencyOf } from '@/features/orders/OrderCard';
import { LANG_STORAGE_KEY } from '@/i18n';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { createFakeApi, makeOrder, STAFF_SESSION } from '@/test/fixtures';

import { App, createQueryClient } from './App';

function renderPanel(
  orders: StaffOrder[] = [],
  {
    path = '/admin/orders',
    role = 'owner',
    loggedIn = true,
  }: { path?: string; role?: StaffAuthResponse['staff']['role']; loggedIn?: boolean } = {},
) {
  const api = createFakeApi(orders);
  const session = createSessionStore(null);
  if (loggedIn) session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', path);
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, session };
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
    expect(links).toEqual(['Orders', 'History', 'Billing']);
    expect(within(nav()).getByRole('link', { name: 'Orders' }).getAttribute('aria-current')).toBe(
      'page',
    );

    const soon = within(nav()).getByRole('list', { name: 'Coming soon' });
    for (const name of ['Menu', 'Locations', 'Rewards', 'Team', 'Reports']) {
      expect(within(soon).getByText(name)).toBeTruthy();
    }
    expect(within(soon).queryAllByRole('link')).toHaveLength(0);
    expect(within(soon).queryAllByRole('button')).toHaveLength(0);
  });

  it('muestra usuario, rol y «Powered by Ventea»; el staff no ve Facturación', async () => {
    renderPanel([makeOrder()], { role: 'staff' });
    await screen.findByText('Ana Pérez');
    expect(screen.getByText('Marta López')).toBeTruthy();
    expect(screen.getAllByText('Staff').length).toBeGreaterThan(0);
    expect(screen.getByText('Powered by Ventea')).toBeTruthy();
    expect(within(nav()).queryByRole('link', { name: 'Billing' })).toBeNull();
    // Marca del tenant: nombre e inicial (sin logo).
    expect(screen.getAllByText('Carolina Hot Chicken').length).toBeGreaterThan(0);
  });

  it('el menú de móvil abre el cajón y Escape lo cierra', async () => {
    renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    const open = screen.getByRole('button', { name: 'Open menu' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.app--drawer-open')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
  });

  it('la barra lateral se contrae y recuerda la elección', async () => {
    renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(document.querySelector('.app--collapsed')).toBeTruthy();
    expect(window.localStorage.getItem('ventea.admin.sidebar')).toBe('collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('una sección sin implementar (ruta vieja) avisa y ofrece volver a pedidos', async () => {
    renderPanel([], { path: '/admin/menu' });
    expect(await screen.findByRole('heading', { name: 'Menu' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to orders' }).getAttribute('href')).toBe(
      '/admin/orders',
    );
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
    expect(within(navEs).getByText('Próximamente')).toBeTruthy();
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
