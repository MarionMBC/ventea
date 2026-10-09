import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { sessionStore } from '../../api/session';
import type { CreateOrderInput } from '../../api/types';
import { ToastProvider } from '../../components/feedback/ToastProvider';
import { AppStateProvider } from '../AppStateProvider';
import { AuthProvider } from '../auth/AuthProvider';
import { resetMenuCache } from '../menu/useMenu';
import { checkoutAttempts } from '../orders/idempotency';
import { CheckoutScreen } from './CheckoutScreen';

/*
 * The checkout with a pending attempt — an order sent whose answer was lost —
 * rendered for real against a mocked API (no network). The attempt must be
 * the source of truth across remounts: same notes, same points, same
 * location, same key, read-only, even when the balance re-read is lower.
 */

const ITEM = 'item-1';

const frozen: CreateOrderInput = {
  locationId: 'l-2',
  fulfillmentType: 'pickup',
  lines: [{ menuItemId: ITEM, quantity: 2, selectedOptionIds: [] }],
  redeemRewardPoints: 150,
  customerNotes: 'no pickles',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Sent {
  key: string | undefined;
  body: unknown;
}

const mockApi = ({ orders = [] as unknown[] } = {}) => {
  const sent: Sent[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/locations')) {
      return json(200, [
        {
          id: 'l-1',
          name: 'Main Street',
          address: '1 Main St',
          latitude: 0,
          longitude: 0,
          phone: null,
          openingHours: null,
        },
        {
          id: 'l-2',
          name: 'South End',
          address: '2 South Blvd',
          latitude: 0,
          longitude: 0,
          phone: null,
          openingHours: null,
        },
      ]);
    }
    if (url.endsWith('/api/tenant')) {
      return json(200, {
        slug: 'demo-burgers',
        name: 'Demo Burgers',
        currency: 'USD',
        branding: {
          primaryColor: '#000',
          secondaryColor: '#fff',
          logoUrl: null,
          appDisplayName: null,
        },
        rewardProgram: {
          isEnabled: true,
          pointsPerCurrencyUnit: 1,
          redemptionValueCents: 1,
          minPointsToRedeem: 100,
          signupBonusPoints: 0,
        },
      });
    }
    /* The lost request did debit the points: nothing left to redeem now. */
    if (url.endsWith('/api/rewards/balance'))
      return json(200, { customerId: 'c-1', balance: 0, lifetimeEarned: 150 });
    if (url.endsWith('/api/menu')) {
      return json(200, {
        locationId: 'l-1',
        currency: 'USD',
        categories: [
          {
            id: 'cat-1',
            name: 'Burgers',
            sortOrder: 0,
            items: [
              {
                id: ITEM,
                categoryId: 'cat-1',
                name: 'Classic burger',
                description: null,
                imageUrl: null,
                basePriceCents: 1290,
                compareAtPriceCents: null,
                tags: [],
                isAvailable: true,
                sortOrder: 0,
                modifierGroups: [],
              },
            ],
          },
        ],
      });
    }
    if (url.endsWith('/api/orders') && method === 'POST') {
      sent.push({
        key: (init?.headers as Record<string, string>)['Idempotency-Key'],
        body: JSON.parse(String(init?.body)),
      });
      return json(200, { id: 'o-1', code: 'DB-0001', status: 'confirmed' });
    }
    if (url.endsWith('/api/orders')) return json(200, orders);
    return json(404, { message: 'Not found' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent };
};

const renderCheckout = (onPlaceOrder = vi.fn()) => {
  const view = render(
    <AuthProvider>
      <AppStateProvider>
        <ToastProvider>
          <CheckoutScreen onPlaceOrder={onPlaceOrder} />
        </ToastProvider>
      </AppStateProvider>
    </AuthProvider>,
  );
  return { ...view, onPlaceOrder };
};

let attemptKey = '';

beforeEach(() => {
  resetMenuCache();
  sessionStore.set({
    accessToken: 'access',
    refreshToken: 'refresh',
    customer: {
      id: 'c-1',
      email: 'jordan@example.com',
      firstName: 'Jordan',
      lastName: 'Reyes',
      phone: null,
    },
  });
  attemptKey = checkoutAttempts.start({ customerId: 'c-1', input: frozen, usePoints: true }).key;
});

afterEach(() => {
  checkoutAttempts.forget();
  act(() => sessionStore.clear('signed-out'));
  vi.unstubAllGlobals();
});

const expectFrozenForm = async () => {
  expect(await screen.findByText("We couldn't confirm your last order")).toBeInTheDocument();
  const notes = screen.getByLabelText(/Notes for the kitchen/) as HTMLTextAreaElement;
  expect(notes.value).toBe('no pickles');
  expect(notes.readOnly).toBe(true);
  const points = screen.getByRole('switch') as HTMLInputElement;
  expect(points.checked).toBe(true);
  expect(points.disabled).toBe(true);
  expect(screen.getByText('Redeeming 150 points on this order.')).toBeInTheDocument();
  expect(await screen.findByText('South End')).toBeInTheDocument();
  expect(await screen.findByText('Classic burger')).toBeInTheDocument();
};

describe('checkout with a pending attempt', () => {
  test('a remount restores and locks the attempt; Retry resends the same key and body', async () => {
    const { sent } = mockApi();

    const first = renderCheckout();
    await expectFrozenForm();
    first.unmount();

    const { onPlaceOrder } = renderCheckout();
    await expectFrozenForm();
    /* The balance is 0 now; the retry must still send the 150 points it sent. */
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ key: attemptKey, body: frozen });
    await waitFor(() => expect(onPlaceOrder).toHaveBeenCalledWith('o-1'));
    expect(checkoutAttempts.pending('c-1')).toBeNull();
  });

  test('Start over checks the orders first and, with none found, discards the attempt on confirmation', async () => {
    const { sent } = mockApi({ orders: [] });
    renderCheckout();
    await expectFrozenForm();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByText('No order found from that attempt')).toBeInTheDocument();
    expect(checkoutAttempts.pending('c-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(checkoutAttempts.pending('c-1')).toBeNull();
    /* The cart was empty (the attempt outlived it): back to the empty state. */
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  test('Start over warns when an order was placed since the attempt', async () => {
    mockApi({ orders: [{ id: 'o-9', code: 'DB-0009', placedAt: new Date().toISOString() }] });
    const { onPlaceOrder } = renderCheckout();
    await expectFrozenForm();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByText(/Order DB-0009 was placed at/)).toBeInTheDocument();
    expect(checkoutAttempts.pending('c-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View order' }));
    expect(onPlaceOrder).toHaveBeenCalledWith('o-9');
  });

  test("another customer's attempt is not shown", async () => {
    mockApi();
    checkoutAttempts.forget();
    checkoutAttempts.start({ customerId: 'c-2', input: frozen, usePoints: true });
    renderCheckout();
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't confirm your last order")).toBeNull();
  });
});
