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
    expect(within(column('New')).getByText('1 order')).toBeTruthy();
    expect(within(column('In the kitchen')).getByText('2 orders')).toBeTruthy();
    expect(within(column('Ready')).getByText('No orders')).toBeTruthy();

    const c = within(card('CHC-1234'));
    expect(c.getByText('Ana Pérez')).toBeTruthy();
    expect(c.getByRole('link', { name: '+504 9999-0000' }).getAttribute('href')).toBe(
      'tel:+504 9999-0000',
    );
    expect(c.getByText('Dine-in')).toBeTruthy();
    expect(c.getByText('3 min')).toBeTruthy();
    expect(c.getByText('2×')).toBeTruthy();
    expect(c.getByText('Hot, Extra salsa')).toBeTruthy();
    expect(c.getByText('Note: sin pepinillos')).toBeTruthy();
    expect(c.getByText(/paso en 10 min/)).toBeTruthy();
    expect(c.getByText('120 pts (−$1.20)')).toBeTruthy();
    expect(c.getByText('$24.60')).toBeTruthy();
    expect(c.getByRole('button', { name: 'Start' })).toBeTruthy();
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

    fireEvent.click(within(card('CHC-2000')).getByRole('button', { name: 'Start' }));

    await waitFor(() =>
      expect(within(column('In the kitchen')).queryByText('CHC-2000')).toBeTruthy(),
    );
    expect(within(column('New')).queryByText('CHC-2000')).toBeNull();
    // Mientras está en vuelo, la tarjeta no admite otro cambio.
    expect(
      (within(card('CHC-2000')).getByRole('button', { name: 'Ready' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => gate.resolve());
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe(`/api/staff/orders/${order.id}/status`);
    expect(patch?.body).toEqual({ status: 'preparing' });
    await waitFor(() =>
      expect(
        (within(card('CHC-2000')).getByRole('button', { name: 'Ready' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(within(column('In the kitchen')).getByText('CHC-2000')).toBeTruthy();
  });

  it('si la API falla, la tarjeta vuelve a su columna y se avisa', async () => {
    const { api } = renderPanel([makeOrder({ code: 'CHC-3000' })]);
    await screen.findByText('CHC-3000');
    api.setOverride((req) => (req.method === 'PATCH' ? apiError(500, 'Error interno') : undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // En inglés, el mensaje de la API (en español) se reemplaza por uno propio, traducido.
    expect(
      await screen.findByText(
        'Couldn’t update order CHC-3000. The server didn’t respond correctly (500). Please try again.',
      ),
    ).toBeTruthy();
    expect(within(column('New')).getByText('CHC-3000')).toBeTruthy();
    expect(within(column('In the kitchen')).queryByText('CHC-3000')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(
      await screen.findByText(
        'Someone else already updated order CHC-4000. The board has been refreshed.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(within(column('Ready')).queryByText('CHC-4000')).toBeTruthy());
    expect(api.count('GET', '/api/staff/orders')).toBeGreaterThan(loadsBefore);
    expect(within(column('New')).getByText('No orders')).toBeTruthy();
  });

  it('cancelar pide confirmación y avisa la devolución de puntos', async () => {
    const order = makeOrder({ code: 'CHC-5000', status: 'preparing', pointsRedeemed: 150 });
    const { api } = renderPanel([order]);
    await screen.findByText('CHC-5000');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel order CHC-5000' }));
    expect(api.count('PATCH', `/api/staff/orders/${order.id}/status`)).toBe(0);
    expect(screen.getByText(/150 points will be returned to the customer/)).toBeTruthy();

    // "No, volver" deja todo como estaba.
    fireEvent.click(screen.getByRole('button', { name: 'No, go back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order CHC-5000' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(
      await screen.findByText(
        'Order CHC-5000 cancelled. 150 points were returned to the customer.',
      ),
    ).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'cancelled' });
    await waitFor(() => expect(screen.queryByTestId('order-CHC-5000')).toBeNull());
    // Era el último pedido: el foco no se pierde en <body>, lo toma el estado vacío.
    expect(document.activeElement?.textContent).toBe('No active orders');
  });

  it('tras cancelar, el foco queda en el título de la columna', async () => {
    renderPanel([makeOrder({ code: 'CHC-5100' }), makeOrder({ code: 'CHC-5101' })]);
    await screen.findByText('CHC-5100');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order CHC-5100' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    await waitFor(() => expect(screen.queryByTestId('order-CHC-5100')).toBeNull());
    expect(document.activeElement?.textContent).toBe('New');
  });

  it('un pedido nuevo en la siguiente carga se resalta y suma al título', async () => {
    const { api } = renderPanel([makeOrder({ code: 'CHC-6000' })]);
    await screen.findByText('CHC-6000');
    await waitFor(() => expect(document.title).toBe('Orders · Carolina Hot Chicken'));
    expect(screen.queryByRole('button', { name: /^New:/ })).toBeNull();

    api.state.orders.push(makeOrder({ code: 'CHC-6001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await screen.findByText('CHC-6001');
    expect(
      within(card('CHC-6001')).getByRole('button', { name: 'New: mark CHC-6001 as seen' }),
    ).toBeTruthy();
    expect(screen.getByText('1 new order')).toBeTruthy();
    expect(within(card('CHC-6000')).queryByRole('button', { name: /^New:/ })).toBeNull();
    await waitFor(() => expect(document.title).toBe('(1) Orders · Carolina Hot Chicken'));

    fireEvent.click(screen.getByRole('button', { name: 'Mark all seen (1)' }));
    await waitFor(() => expect(document.title).toBe('Orders · Carolina Hot Chicken'));
    expect(screen.queryByRole('button', { name: /^New:/ })).toBeNull();
  });

  it('el sonido arranca apagado y el toggle recuerda la elección', async () => {
    renderPanel([makeOrder()]);
    const toggle = await screen.findByRole('button', { name: 'Sound' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Sound' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('ventea.admin.sound')).toBe('on');
  });

  it('selector de columna del teléfono: rótulo corto visible, nombre completo accesible', async () => {
    renderPanel([makeOrder({ code: 'CHC-6100', status: 'preparing' })]);
    await screen.findByText('CHC-6100');
    const group = screen.getByRole('group', { name: 'Column to show' });
    const kitchen = within(group).getByRole('button', { name: /In the kitchen/ });
    expect(kitchen.querySelector('[aria-hidden="true"]')?.textContent).toBe('Kitchen');
    expect(kitchen.textContent).toContain('1');
  });

  it('estado vacío', async () => {
    renderPanel([]);
    expect(await screen.findByText('No active orders')).toBeTruthy();
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

    expect(await screen.findByText('We couldn’t load orders')).toBeTruthy();
    expect(
      screen.getByText('The server didn’t respond correctly (503). Please try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Servicio no disponible')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
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
    expect(screen.getByText('Delivered', { selector: '.status-chip' })).toBeTruthy();
    expect(screen.getByText('Cancelled', { selector: '.status-chip' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start|Ready|Cancel order/ })).toBeNull();

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
    expect(await screen.findByRole('heading', { name: 'Restaurant dashboard' })).toBeTruthy();

    api.setOverride((req) =>
      req.path === '/api/staff/auth/login' ? apiError(401, 'Credenciales inválidas') : undefined,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@chc.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'mala' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect email or password.');
  });

  it('login correcto guarda la sesión y abre el tablero; cerrar sesión vuelve al login', async () => {
    const { api, session } = renderPanel([makeOrder({ code: 'CHC-9000' })], {
      path: '/admin/login',
      loggedIn: false,
    });
    api.setOverride((req) =>
      req.path === '/api/staff/auth/login' ? json(STAFF_SESSION) : undefined,
    );

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: ' Owner@chc.test ' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'staff-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('CHC-9000')).toBeTruthy();
    expect(api.calls.find((c) => c.path === '/api/staff/auth/login')?.body).toEqual({
      email: 'Owner@chc.test',
      password: 'staff-password-123',
    });
    expect(session.get()?.staff.name).toBe('Marta López');
    expect(window.location.pathname).toBe('/admin/orders');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Restaurant dashboard' })).toBeTruthy();
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

    expect(await screen.findByRole('heading', { name: 'Restaurant dashboard' })).toBeTruthy();
    expect(session.get()).toBeNull();
  });
});
