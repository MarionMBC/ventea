import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  RewardCatalogItem,
  RewardCustomerDetail,
  RewardCustomersPage,
  StaffRewards,
} from '@ventea/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { createFakeApi, json, STAFF_SESSION } from '@/test/fixtures';
import { makeMenu, menuHandler } from '@/test/menu-fixtures';

import { parseRate, programInput } from './ProgramCard';

const CUSTOMER_ID = '00000000-0000-4000-8000-00000000c001';
const REWARD_ID = '00000000-0000-4000-8000-00000000a001';

function makeRewards(): StaffRewards {
  return {
    currency: 'USD',
    program: {
      isEnabled: true,
      pointsPerCurrencyUnit: 1,
      redemptionValueCents: 1,
      minPointsToRedeem: 100,
      signupBonusPoints: 50,
    },
    catalog: [
      {
        id: REWARD_ID,
        name: '$5 off',
        pointsCost: 500,
        kind: 'discount',
        menuItemId: null,
        discountCents: 500,
        isActive: true,
        menuItemName: null,
      },
    ],
  };
}

const customer = {
  id: CUSTOMER_ID,
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Pérez',
  balance: 120,
  lifetimeEarned: 300,
  lastActivityAt: new Date('2026-10-01T15:00:00Z'),
};

function renderRewards({ role = 'owner' }: { role?: 'owner' | 'manager' | 'staff' } = {}) {
  const state = {
    rewards: makeRewards(),
    menu: makeMenu(),
    detail: {
      customer,
      entries: [
        {
          id: '00000000-0000-4000-8000-00000000e001',
          points: 50,
          reason: 'signup_bonus',
          orderCode: null,
          rewardName: null,
          staffNote: null,
          staffName: null,
          createdAt: new Date('2026-09-01T15:00:00Z'),
        },
      ],
    } as RewardCustomerDetail,
  };
  const api = createFakeApi();
  const menu = menuHandler(state);
  api.setOverride(async (req) => {
    if (req.path === '/api/staff/rewards' && req.method === 'GET') return json(state.rewards);
    if (req.path === '/api/staff/rewards/program' && req.method === 'PUT') {
      state.rewards = { ...state.rewards, program: req.body as StaffRewards['program'] };
      return json(state.rewards);
    }
    if (req.path === '/api/staff/rewards/catalog' && req.method === 'POST') {
      const created = {
        ...(req.body as object),
        id: '00000000-0000-4000-8000-00000000a002',
        menuItemId: null,
        menuItemName: null,
      } as RewardCatalogItem;
      state.rewards = { ...state.rewards, catalog: [...state.rewards.catalog, created] };
      return json(created, 201);
    }
    if (req.path === '/api/staff/rewards/customers') {
      const page: RewardCustomersPage = {
        items: req.query.get('q') === 'zzz' ? [] : [customer],
        total: req.query.get('q') === 'zzz' ? 0 : 1,
        page: 1,
        pageSize: 20,
      };
      return json(page);
    }
    if (req.path === `/api/staff/rewards/customers/${CUSTOMER_ID}`) return json(state.detail);
    if (req.path === `/api/staff/rewards/customers/${CUSTOMER_ID}/adjustments`) {
      const body = req.body as { points: number; reason: string };
      state.detail = {
        customer: {
          ...state.detail.customer,
          balance: state.detail.customer.balance + body.points,
        },
        entries: [
          {
            id: '00000000-0000-4000-8000-00000000e002',
            points: body.points,
            reason: 'manual_adjustment',
            orderCode: null,
            rewardName: null,
            staffNote: body.reason,
            staffName: 'Marta López',
            createdAt: new Date('2026-10-09T15:00:00Z'),
          },
          ...state.detail.entries,
        ],
      };
      return json(state.detail, 201);
    }
    return menu(req);
  });
  const session = createSessionStore(null);
  session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', '/admin/rewards');
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, state };
}

afterEach(() => {
  document.title = '';
});

describe('parseRate / programInput', () => {
  it('hasta 2 decimales, coma o punto, de 0 a 1000', () => {
    expect(parseRate('1')).toBe(1);
    expect(parseRate('0,5')).toBe(0.5);
    expect(parseRate('2.25')).toBe(2.25);
    expect(parseRate('1.234')).toBeNull();
    expect(parseRate('1001')).toBeNull();
    expect(parseRate('-1')).toBeNull();
  });

  it('montos en centavos y enteros', () => {
    expect(
      programInput({
        isEnabled: true,
        pointsPerCurrencyUnit: '1.5',
        redemptionValue: '0.05',
        minPointsToRedeem: '100',
        signupBonusPoints: '0',
      }),
    ).toEqual({
      input: {
        isEnabled: true,
        pointsPerCurrencyUnit: 1.5,
        redemptionValueCents: 5,
        minPointsToRedeem: 100,
        signupBonusPoints: 0,
      },
    });
    expect(
      programInput({
        isEnabled: true,
        pointsPerCurrencyUnit: 'x',
        redemptionValue: '0.05',
        minPointsToRedeem: '1.5',
        signupBonusPoints: '0',
      }),
    ).toEqual({ errors: { pointsPerCurrencyUnit: true, minPointsToRedeem: true } });
  });
});

describe('Puntos', () => {
  it('solo el dueño: el gerente vuelve a pedidos y no ve el enlace', async () => {
    renderRewards({ role: 'manager' });
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Rewards' })).toBeNull();
  });

  it('guarda el programa con números y apagarlo avisa', async () => {
    const { api } = renderRewards();
    const rate = (await screen.findByLabelText(/Points per/)) as HTMLInputElement;
    expect(rate.value).toBe('1');
    fireEvent.change(rate, { target: { value: '1.234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/Enter a number from 0 to 1000/)).toBeTruthy();
    expect(api.count('PUT', '/api/staff/rewards/program')).toBe(0);

    fireEvent.change(rate, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Loyalty program' }));
    expect(screen.getByText(/With the program off/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Program saved/)).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      isEnabled: false,
      pointsPerCurrencyUnit: 2,
      redemptionValueCents: 1,
      minPointsToRedeem: 100,
      signupBonusPoints: 50,
    });
    // La app (GET /api/tenant) se recarga para reflejarlo.
    await waitFor(() => expect(api.count('GET', '/api/tenant')).toBeGreaterThan(1));
  });

  it('crea una recompensa de descuento desde el panel lateral', async () => {
    const { api } = renderRewards();
    const catalog = (await screen.findByRole('heading', { name: 'Rewards catalog' })).closest(
      'article',
    )!;
    expect(within(catalog).getByText('$5 off')).toBeTruthy();
    expect(within(catalog).getByText('500 points')).toBeTruthy();
    fireEvent.click(within(catalog).getByRole('button', { name: /New reward/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New reward' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Give the reward a name.')).toBeTruthy();
    expect(within(dialog).getByText('Choose the product the customer gets.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Café gratis' } });
    fireEvent.change(within(dialog).getByLabelText('Cost in points'), { target: { value: '80' } });
    fireEvent.click(within(dialog).getByLabelText('Fixed discount'));
    fireEvent.change(within(dialog).getByLabelText(/Discount/), { target: { value: '1,50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('“Café gratis” saved.')).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toEqual({
      name: 'Café gratis',
      pointsCost: 80,
      isActive: true,
      kind: 'discount',
      discountCents: 150,
    });
  });

  it('ajuste manual: valida saldo y motivo, y queda en el historial con el autor', async () => {
    const { api } = renderRewards();
    fireEvent.click(await screen.findByRole('button', { name: 'Manage points of Ana Pérez' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ana Pérez' });
    expect(await within(dialog).findByText('Sign-up bonus')).toBeTruthy();

    fireEvent.click(within(dialog).getByLabelText('Remove'));
    fireEvent.change(within(dialog).getByLabelText('Points'), { target: { value: '500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText('The customer has 120 points.')).toBeTruthy();
    expect(within(dialog).getByText(/Write a reason/)).toBeTruthy();
    expect(api.calls.some((c) => c.path.endsWith('/adjustments'))).toBe(false);

    fireEvent.change(within(dialog).getByLabelText('Points'), { target: { value: '20' } });
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Pedido duplicado' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(await within(dialog).findByText('Adjustment saved.')).toBeTruthy();
    expect(api.calls.find((c) => c.path.endsWith('/adjustments'))!.body).toEqual({
      points: -20,
      reason: 'Pedido duplicado',
    });
    expect(within(dialog).getByText('Pedido duplicado')).toBeTruthy();
    expect(within(dialog).getByText(/by Marta López/)).toBeTruthy();
    expect(within(dialog).getByText('-20')).toBeTruthy();
    // El canje del catálogo (500) no alcanza con 100 puntos: la opción queda deshabilitada.
    const option = within(dialog).getByRole('option', { name: /\$5 off/ }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
  });

  it('búsqueda sin resultados', async () => {
    renderRewards();
    const search = await screen.findByLabelText('Search by name or email');
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(await screen.findByText('No customers match “zzz”.')).toBeTruthy();
  });
});
