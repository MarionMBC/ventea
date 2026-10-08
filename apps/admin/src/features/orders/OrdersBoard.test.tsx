import type { StaffOrder } from '@ventea/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { apiError, createFakeApi, json, makeOrder, STAFF_SESSION } from '@/test/fixtures';

interface PanelOptions {
  path?: string;
  loggedIn?: boolean;
  /** Prepara la API falsa antes del primer render (errores desde la primera carga). */
  before?: (api: ReturnType<typeof createFakeApi>) => void;
}

function renderPanel(orders: StaffOrder[], options: PanelOptions = {}) {
  const { path = '/admin/orders', loggedIn = true, before } = options;
  const api = createFakeApi(orders);
  before?.(api);
  const session = createSessionStore(null);
  if (loggedIn) session.set(STAFF_SESSION);
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', path);
  const view = render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, session, queryClient, view };
}

const column = (name: string) => screen.getByRole('region', { name });
const card = (code: string) => screen.getByTestId(`order-${code}`);

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  document.title = '';
});

describe('Tablero de pedidos', () => {
  it('muestra las tres columnas con contador y los datos del pedido', async () => {
    const nuevo = makeOrder({
      code: 'CHC-1234',
      fulfillmentType: 'dine_in',
      customerNotes: 'paso en 10 min',
      pointsRedeemed: 120,
      discountCents: 120,
      totalCents: 2460,
      lines: [
        {
          ...makeOrder().lines[0]!,
          notes: 'sin pepinillos',
          selectedOptions: [
            { id: null, nameSnapshot: 'Hot', priceDeltaCents: 0 },
            { id: null, nameSnapshot: 'Extra salsa', priceDeltaCents: 100 },
          ],
        },
      ],
    });
    renderPanel([nuevo, makeOrder({ status: 'preparing' }), makeOrder({ status: 'preparing' })]);

    expect(await screen.findByText('CHC-1234')).toBeTruthy();
    expect(within(column('Nuevos')).getByLabelText('1 pedidos')).toBeTruthy();
    expect(within(column('En cocina')).getByLabelText('2 pedidos')).toBeTruthy();
    expect(within(column('Listos')).getByText('Sin pedidos')).toBeTruthy();

    const c = within(card('CHC-1234'));
    expect(c.getByText('Ana Pérez')).toBeTruthy();
    expect(c.getByRole('link', { name: '+504 9999-0000' }).getAttribute('href')).toBe(
      'tel:+504 9999-0000',
    );
    expect(c.getByText('Comer aquí')).toBeTruthy();
    expect(c.getByText('hace 3 min')).toBeTruthy();
    expect(c.getByText('2×')).toBeTruthy();
    expect(c.getByText('Hot, Extra salsa')).toBeTruthy();
    expect(c.getByText('Nota: sin pepinillos')).toBeTruthy();
    expect(c.getByText(/paso en 10 min/)).toBeTruthy();
    expect(c.getByText('120 pts (−$1.20)')).toBeTruthy();
    expect(c.getByText('$24.60')).toBeTruthy();
    expect(c.getByRole('button', { name: 'Empezar' })).toBeTruthy();
  });

  it('pide los tres estados activos por separado', async () => {
    const { api } = renderPanel([makeOrder()]);
    await screen.findByText('Ana Pérez');
    const statuses = api.calls
      .filter((c) => c.path === '/api/staff/orders')
      .map((c) => c.query.get('status'));
    expect(statuses.sort()).toEqual(['confirmed', 'preparing', 'ready']);
  });

  it('avanza optimista: la tarjeta cambia de columna antes de que responda la API', async () => {
    const order = makeOrder({ code: 'CHC-2000' });
    const { api } = renderPanel([order]);
    await screen.findByText('CHC-2000');

    const gate = deferred<void>();
    api.setOverride(async (req) => {
      if (req.method !== 'PATCH') return undefined;
      await gate.promise;
      return undefined; // sigue al handler normal, que aplica el cambio
    });

    fireEvent.click(within(card('CHC-2000')).getByRole('button', { name: 'Empezar' }));

    await waitFor(() => expect(within(column('En cocina')).queryByText('CHC-2000')).toBeTruthy());
    expect(within(column('Nuevos')).queryByText('CHC-2000')).toBeNull();
    // Mientras está en vuelo, la tarjeta no admite otro cambio.
    expect(
      (within(card('CHC-2000')).getByRole('button', { name: 'Listo' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => gate.resolve());
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe(`/api/staff/orders/${order.id}/status`);
    expect(patch?.body).toEqual({ status: 'preparing' });
    await waitFor(() =>
      expect(
        (within(card('CHC-2000')).getByRole('button', { name: 'Listo' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(within(column('En cocina')).getByText('CHC-2000')).toBeTruthy();
  });

  it('si la API falla, la tarjeta vuelve a su columna y se avisa', async () => {
    const { api } = renderPanel([makeOrder({ code: 'CHC-3000' })]);
    await screen.findByText('CHC-3000');
    api.setOverride((req) => (req.method === 'PATCH' ? apiError(500, 'Error interno') : undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));

    expect(
      await screen.findByText('No se pudo actualizar el pedido CHC-3000. Error interno'),
    ).toBeTruthy();
    expect(within(column('Nuevos')).getByText('CHC-3000')).toBeTruthy();
    expect(within(column('En cocina')).queryByText('CHC-3000')).toBeNull();
  });

  it('un 409 (otro staff ya lo movió) avisa y recarga el tablero con el estado real', async () => {
    const order = makeOrder({ code: 'CHC-4000' });
    const { api } = renderPanel([order]);
    await screen.findByText('CHC-4000');
    const loadsBefore = api.count('GET', '/api/staff/orders');

    api.setOverride((req) => {
      if (req.method !== 'PATCH') return undefined;
      // Otra persona ya lo pasó a "listo" mientras tanto.
      api.state.orders[0]!.status = 'ready';
      return apiError(409, 'El pedido cambió de estado; recarga e intenta de nuevo');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Empezar' }));

    expect(
      await screen.findByText(
        'Otra persona ya cambió el pedido CHC-4000. Actualizamos el tablero.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(within(column('Listos')).queryByText('CHC-4000')).toBeTruthy());
    expect(api.count('GET', '/api/staff/orders')).toBeGreaterThan(loadsBefore);
    expect(within(column('Nuevos')).getByText('Sin pedidos')).toBeTruthy();
  });

  it('cancelar pide confirmación y avisa la devolución de puntos', async () => {
    const order = makeOrder({ code: 'CHC-5000', status: 'preparing', pointsRedeemed: 150 });
    const { api } = renderPanel([order]);
    await screen.findByText('CHC-5000');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido CHC-5000' }));
    expect(api.count('PATCH', `/api/staff/orders/${order.id}/status`)).toBe(0);
    expect(screen.getByText(/Se devuelven 150 puntos al cliente/)).toBeTruthy();

    // "No, volver" deja todo como estaba.
    fireEvent.click(screen.getByRole('button', { name: 'No, volver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido CHC-5000' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    expect(
      await screen.findByText('Pedido CHC-5000 cancelado. Se devolvieron 150 puntos al cliente.'),
    ).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'cancelled' });
    await waitFor(() => expect(screen.queryByTestId('order-CHC-5000')).toBeNull());
  });

  it('un pedido nuevo en la siguiente carga se resalta y suma al título', async () => {
    const { api } = renderPanel([makeOrder({ code: 'CHC-6000' })]);
    await screen.findByText('CHC-6000');
    await waitFor(() => expect(document.title).toBe('Pedidos · Carolina Hot Chicken'));
    expect(screen.queryByRole('button', { name: 'Nuevo' })).toBeNull();

    api.state.orders.push(makeOrder({ code: 'CHC-6001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await screen.findByText('CHC-6001');
    expect(within(card('CHC-6001')).getByRole('button', { name: 'Nuevo' })).toBeTruthy();
    expect(within(card('CHC-6000')).queryByRole('button', { name: 'Nuevo' })).toBeNull();
    await waitFor(() => expect(document.title).toBe('(1) Pedidos · Carolina Hot Chicken'));

    fireEvent.click(screen.getByRole('button', { name: 'Marcar vistos (1)' }));
    await waitFor(() => expect(document.title).toBe('Pedidos · Carolina Hot Chicken'));
    expect(screen.queryByRole('button', { name: 'Nuevo' })).toBeNull();
  });

  it('el sonido arranca apagado y el toggle recuerda la elección', async () => {
    renderPanel([makeOrder()]);
    const toggle = await screen.findByRole('button', { name: 'Sonido: apagado' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: 'Sonido: activado' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(window.localStorage.getItem('ventea.admin.sound')).toBe('on');
  });

  it('estado vacío', async () => {
    renderPanel([]);
    expect(await screen.findByText('No hay pedidos activos')).toBeTruthy();
  });

  it('error con reintento', async () => {
    let fail = true;
    renderPanel([makeOrder({ code: 'CHC-7000' })], {
      before: (api) =>
        api.setOverride((req) =>
          fail && req.path === '/api/staff/orders'
            ? apiError(503, 'Servicio no disponible')
            : undefined,
        ),
    });

    expect(await screen.findByText('No pudimos cargar los pedidos')).toBeTruthy();
    expect(screen.getByText('Servicio no disponible')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('CHC-7000')).toBeTruthy();
  });

  it('historial: entregados y cancelados de hoy, solo lectura', async () => {
    const { api } = renderPanel(
      [
        makeOrder({ code: 'CHC-8001', status: 'completed' }),
        makeOrder({ code: 'CHC-8002', status: 'cancelled' }),
        makeOrder({ code: 'CHC-8003', status: 'confirmed' }),
      ],
      { path: '/admin/orders/history' },
    );

    expect(await screen.findByText('CHC-8001')).toBeTruthy();
    expect(screen.getByText('CHC-8002')).toBeTruthy();
    expect(screen.queryByText('CHC-8003')).toBeNull();
    expect(screen.getByText('Entregado')).toBeTruthy();
    expect(screen.getByText('Cancelado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Empezar|Listo|Cancelar pedido/ })).toBeNull();

    const historyCalls = api.calls.filter(
      (c) => c.path === '/api/staff/orders' && c.query.get('since'),
    );
    expect(historyCalls.map((c) => c.query.get('status')).sort()).toEqual([
      'cancelled',
      'completed',
    ]);
    const since = new Date(historyCalls[0]!.query.get('since')!);
    expect(since.getHours()).toBe(0);
    expect(since.getMinutes()).toBe(0);
  });
});

describe('Login y sesión', () => {
  it('sin sesión manda al login; clave incorrecta muestra el error de la API', async () => {
    const { api } = renderPanel([], { loggedIn: false });
    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeTruthy();

    api.setOverride((req) =>
      req.path === '/api/staff/auth/login' ? apiError(401, 'Credenciales inválidas') : undefined,
    );
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'owner@chc.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'mala' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Credenciales inválidas');
  });

  it('login correcto guarda la sesión y abre el tablero; cerrar sesión vuelve al login', async () => {
    const { api, session } = renderPanel([makeOrder({ code: 'CHC-9000' })], {
      path: '/admin/login',
      loggedIn: false,
    });
    api.setOverride((req) =>
      req.path === '/api/staff/auth/login' ? json(STAFF_SESSION) : undefined,
    );

    fireEvent.change(await screen.findByLabelText('Correo'), {
      target: { value: ' Owner@chc.test ' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'staff-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('CHC-9000')).toBeTruthy();
    expect(api.calls.find((c) => c.path === '/api/staff/auth/login')?.body).toEqual({
      email: 'Owner@chc.test',
      password: 'staff-password-123',
    });
    expect(session.get()?.staff.name).toBe('Marta López');
    expect(window.location.pathname).toBe('/admin/orders');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeTruthy();
    expect(session.get()).toBeNull();
  });

  it('un token que la API no acepta como staff (p. ej. de cliente) termina en el login', async () => {
    const { session } = renderPanel([makeOrder()], {
      before: (api) =>
        api.setOverride((req) => {
          if (req.path === '/api/auth/refresh') {
            return json({ accessToken: 'customer-a', refreshToken: 'customer-r' });
          }
          return req.path.startsWith('/api/staff/')
            ? apiError(401, 'Sesión inválida o expirada')
            : undefined;
        }),
    });

    expect(await screen.findByRole('heading', { name: 'Panel del local' })).toBeTruthy();
    expect(session.get()).toBeNull();
  });
});
