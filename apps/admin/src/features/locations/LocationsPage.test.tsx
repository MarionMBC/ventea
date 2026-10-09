import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { StaffLocation, StaffLocations } from '@ventea/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { createFakeApi, json, STAFF_SESSION } from '@/test/fixtures';

import { hoursGroups, weekDraft, weekRanges } from './hours';
import { locationBody } from './LocationDrawer';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function makeLocation(overrides: Partial<StaffLocation> = {}): StaffLocation {
  return {
    id: uuid(1),
    name: 'Sucursal Centro',
    address: 'Av. Principal 123',
    phone: '+504 2222-3333',
    latitude: 0,
    longitude: 0,
    openingHours: [1, 2, 3, 4, 5].map((day) => ({ day, opens: '11:00', closes: '22:00' })),
    isActive: true,
    acceptsOrders: true,
    hasOrders: false,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

function renderLocations({
  role = 'owner',
  data = {
    locations: [makeLocation()],
    usage: { used: 1, max: 3, plan: 'pro', planName: 'Pro' },
  },
  fail,
}: {
  role?: 'owner' | 'manager' | 'staff';
  data?: StaffLocations;
  fail?: { status: number; body: object };
} = {}) {
  const state = { data };
  const api = createFakeApi();
  api.setOverride((req) => {
    if (req.path === '/api/staff/locations' && req.method === 'GET') return json(state.data);
    if (req.path === '/api/staff/locations' && req.method === 'POST') {
      if (fail) return json(fail.body, fail.status);
      const created = makeLocation({ ...(req.body as Partial<StaffLocation>), id: uuid(2) });
      state.data = { ...state.data, locations: [...state.data.locations, created] };
      return json(created, 201);
    }
    const match = req.path.match(/^\/api\/staff\/locations\/(.+)$/);
    if (match && req.method === 'PATCH') {
      const location = state.data.locations.find((l) => l.id === match[1])!;
      Object.assign(location, req.body);
      return json(location);
    }
    if (match && req.method === 'DELETE') {
      state.data = {
        ...state.data,
        locations: state.data.locations.filter((l) => l.id !== match[1]),
      };
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  const session = createSessionStore(null);
  session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', '/admin/locations');
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, state };
}

afterEach(() => {
  document.title = '';
});

describe('horario', () => {
  it('agrupa días seguidos con el mismo horario, de lunes a domingo', () => {
    const groups = hoursGroups([
      ...[1, 2, 3, 4, 5].map((day) => ({ day, opens: '11:00', closes: '22:00' })),
      { day: 6, opens: '12:00', closes: '23:00' },
    ]);
    expect(groups.map((g) => [g.from, g.to, g.ranges?.[0]?.opens ?? null])).toEqual([
      [1, 5, '11:00'],
      [6, 6, '12:00'],
      [0, 0, null],
    ]);
  });

  it('el formulario conserva el segundo tramo de un día y vuelve a la forma de la API', () => {
    const ranges = [
      { day: 1, opens: '19:00', closes: '23:00' },
      { day: 1, opens: '12:00', closes: '15:00' },
    ];
    const week = weekDraft(ranges);
    expect(week[1]).toMatchObject({ open: true, opens: '12:00', closes: '15:00' });
    expect(week[0].open).toBe(false);
    expect(weekRanges(week)).toEqual([
      { day: 1, opens: '12:00', closes: '15:00' },
      { day: 1, opens: '19:00', closes: '23:00' },
    ]);
  });

  it('PATCH solo con lo que cambió', () => {
    const location = makeLocation();
    const draft = {
      name: 'Sucursal Centro',
      address: 'Av. Principal 123',
      phone: '+504 2222-3333',
      isActive: true,
      acceptsOrders: false,
      week: weekDraft(location.openingHours),
    };
    expect(locationBody(location, draft)).toEqual({ acceptsOrders: false });
  });
});

describe('Sucursales', () => {
  it('lista con estado, horario y el cupo del plan', async () => {
    renderLocations();
    expect(await screen.findByRole('heading', { level: 1, name: 'Locations' })).toBeTruthy();
    const card = screen.getByRole('heading', { name: 'Sucursal Centro' }).closest('li')!;
    expect(within(card).getByText('Active')).toBeTruthy();
    expect(within(card).getByText('Taking orders')).toBeTruthy();
    expect(within(card).getByText('Mon–Fri 11:00–22:00 · Sat–Sun Closed')).toBeTruthy();
    expect(screen.getByText('1 of 3 in use · Pro plan')).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'Active locations' })).toBeTruthy();
  });

  it('staff: solo lectura, sin crear ni editar', async () => {
    renderLocations({ role: 'staff' });
    await screen.findByRole('heading', { name: 'Sucursal Centro' });
    expect(screen.queryByRole('button', { name: 'New location' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Sucursal Centro' })).toBeNull();
    expect(screen.getByText('Only the owner and managers can change locations.')).toBeTruthy();
  });

  it('vacío', async () => {
    renderLocations({
      data: { locations: [], usage: { used: 0, max: null, plan: 'chain', planName: 'Cadena' } },
    });
    expect(await screen.findByText('No locations yet')).toBeTruthy();
    expect(screen.getByText('0 in use · Chain plan, no limit')).toBeTruthy();
  });

  it('crear: valida, manda el horario y muestra «guardando» y el aviso', async () => {
    const { api } = renderLocations({ role: 'manager' });
    fireEvent.click(await screen.findByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog', { name: 'New location' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save location' }));
    expect(within(dialog).getAllByText('This field is required.')).toHaveLength(2);

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Norte' } });
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: 'Calle 9' } });
    fireEvent.click(within(dialog).getByLabelText('Monday open'));
    fireEvent.change(within(dialog).getByLabelText('Monday closing time'), {
      target: { value: '23:30' },
    });
    fireEvent.click(within(dialog).getByRole('switch', { name: /Taking orders/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save location' }));

    expect(await screen.findByText('Location created.')).toBeTruthy();
    const post = api.calls.find((c) => c.method === 'POST' && c.path === '/api/staff/locations');
    expect(post?.body).toEqual({
      name: 'Norte',
      address: 'Calle 9',
      phone: null,
      isActive: true,
      acceptsOrders: false,
      openingHours: [{ day: 1, opens: '11:00', closes: '23:30' }],
    });
  });

  it('límite del plan: la API responde plan_limit y se muestra traducido', async () => {
    renderLocations({
      data: {
        locations: [makeLocation()],
        usage: { used: 1, max: 1, plan: 'basic', planName: 'Básico' },
      },
      fail: {
        status: 403,
        body: {
          statusCode: 403,
          message: 'El plan Básico permite hasta 1 sucursal activa',
          error: 'Forbidden',
          code: 'plan_limit',
          limit: { resource: 'locations', plan: 'basic', planName: 'Básico', max: 1 },
        },
      },
    });
    expect(
      await screen.findByText('You reached your plan’s limit. Upgrade it to add more.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog', { name: 'New location' });
    // Al tope, la nueva nace inactiva.
    expect(
      within(dialog)
        .getByRole('switch', { name: /Inactive/ })
        .getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.click(within(dialog).getByRole('switch', { name: /Inactive/ }));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Norte' } });
    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: 'Calle 9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save location' }));
    expect(
      await within(dialog).findByText(
        'Your Basic plan allows 1 active location. Upgrade your plan to add more.',
      ),
    ).toBeTruthy();
  });

  it('borrar: deshabilitado con pedidos; sin pedidos pide confirmación', async () => {
    renderLocations({
      data: {
        locations: [makeLocation(), makeLocation({ id: uuid(3), name: 'Vieja', hasOrders: true })],
        usage: { used: 2, max: null, plan: 'chain', planName: 'Cadena' },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Vieja' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit location' });
    expect(
      (within(dialog).getByRole('button', { name: 'Delete location' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Sucursal Centro' }));
    dialog = screen.getByRole('dialog', { name: 'Edit location' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete location' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete Sucursal Centro?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Location deleted.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Sucursal Centro' })).toBeNull(),
    );
  });
});
