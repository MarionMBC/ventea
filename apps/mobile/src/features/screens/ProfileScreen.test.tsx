import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { sessionStore } from '../../api/session';
import { AuthProvider } from '../auth/AuthProvider';
import { earnRateText, ProfileScreen } from './ProfileScreen';

/*
 * The profile reflects the brand's points setup from `/api/tenant` (TASK-023): the earn rate,
 * the catalog rewards with how far the customer is from each, and counter redemptions in the
 * activity. An API without `rewards` (older deploy) still renders the profile.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const customer = {
  id: 'c-1',
  email: 'jordan@example.com',
  firstName: 'Jordan',
  lastName: 'Reyes',
  phone: null,
};

const mockApi = ({ rewards, enabled = true }: { rewards?: unknown[]; enabled?: boolean }) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me')) return json(200, customer);
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
            isEnabled: enabled,
            pointsPerCurrencyUnit: 2,
            redemptionValueCents: 1,
            minPointsToRedeem: 100,
            signupBonusPoints: 0,
          },
          ...(rewards ? { rewards } : {}),
        });
      }
      if (url.endsWith('/api/rewards/balance'))
        return json(200, { customerId: 'c-1', balance: 120, lifetimeEarned: 300 });
      if (url.endsWith('/api/rewards/ledger')) {
        return json(200, [
          {
            id: 'e-1',
            points: -100,
            reason: 'redemption',
            orderId: null,
            note: 'Free fries',
            createdAt: '2026-10-09T15:00:00Z',
          },
        ]);
      }
      return json(404, { message: 'Not found' });
    }),
  );
};

beforeEach(() => {
  sessionStore.set({ accessToken: 'access', refreshToken: 'refresh', customer });
});

afterEach(() => {
  act(() => sessionStore.clear('signed-out'));
  vi.unstubAllGlobals();
});

const renderProfile = () =>
  render(
    <AuthProvider>
      <ProfileScreen />
    </AuthProvider>,
  );

describe('profile points (TASK-023)', () => {
  test('shows the earn rate, the catalog and counter redemptions', async () => {
    mockApi({
      rewards: [
        {
          id: 'r-1',
          name: 'Free fries',
          pointsCost: 100,
          kind: 'item',
          menuItemId: 'm-1',
          discountCents: null,
        },
        {
          id: 'r-2',
          name: 'Big discount',
          pointsCost: 500,
          kind: 'discount',
          menuItemId: null,
          discountCents: 500,
        },
      ],
    });
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Rewards' })).toBeInTheDocument();
    expect(screen.getByText(/You earn 2 points per/)).toBeInTheDocument();
    expect(await screen.findByText('Free product · You can redeem it')).toBeInTheDocument();
    expect(screen.getByText(/off · 380 points to go/)).toBeInTheDocument();
    expect(screen.getByText('500 pts')).toBeInTheDocument();
    expect(await screen.findByText('Reward: Free fries')).toBeInTheDocument();
  });

  test('earn rate reads naturally below 1 and without long decimals (review)', () => {
    expect(earnRateText(0.5)).toMatch(/^You earn 1 point for every \D*2(\.00)? spent\.$/);
    expect(earnRateText(2.5)).toMatch(/^You earn 2\.5 points per /);
    expect(earnRateText(1.234)).toMatch(/^You earn 1\.23 points per /);
  });

  test('an API without rewards still renders the points', async () => {
    mockApi({});
    renderProfile();
    expect(await screen.findByText('Points activity')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rewards' })).toBeNull();
  });

  test('programme off: no points and no rewards', async () => {
    mockApi({ enabled: false, rewards: [] });
    renderProfile();
    expect(await screen.findByText('jordan@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Points activity')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Rewards' })).toBeNull();
  });
});
