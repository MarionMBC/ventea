import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { resetMenuCache } from './features/menu/useMenu';

/* The app talks to the API on start: these tests run it offline, with fetch
   failing, which is exactly the network-error path a guest can hit. */
beforeEach(() => {
  resetMenuCache();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('renders without crashing', () => {
  const { baseElement } = render(<App />);
  expect(baseElement).toBeDefined();
});

test('checkout without a session goes to the login, keeping the way back', async () => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/checkout');
  render(<App />);
  expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/login');
  expect(new URLSearchParams(window.location.search).get('redirect')).toBe('/checkout');
});

test('a network error on the menu shows a retry, never a blank screen', async () => {
  window.history.pushState({}, '', '/home');
  render(<App />);
  expect(await screen.findByText('We could not load the menu')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});

test('the brand and the menu come from the API: name, colours, photos, no mock content', async () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/tenant')) {
        return json({
          slug: 'demo-burgers',
          name: 'Demo Burgers',
          currency: 'CLP',
          branding: {
            primaryColor: '#123456',
            secondaryColor: '#1F1D1B',
            logoUrl: null,
            appDisplayName: 'Test Brand',
          },
          rewardProgram: {
            isEnabled: false,
            pointsPerCurrencyUnit: 0,
            redemptionValueCents: 0,
            minPointsToRedeem: 0,
            signupBonusPoints: 0,
          },
        });
      }
      if (url.endsWith('/api/locations')) return json([]);
      if (url.endsWith('/api/menu')) {
        return json({
          locationId: 'l-1',
          currency: 'CLP',
          categories: [
            {
              id: 'cat-1',
              name: 'Burgers',
              sortOrder: 0,
              items: [
                {
                  id: 'item-1',
                  categoryId: 'cat-1',
                  name: 'House burger',
                  description: 'Beef and cheese',
                  imageUrl: 'https://cdn.test/api/media/t/burger.webp',
                  basePriceCents: 890000,
                  compareAtPriceCents: null,
                  tags: ['popular'],
                  isAvailable: true,
                  sortOrder: 0,
                  modifierGroups: [],
                },
              ],
            },
          ],
        });
      }
      return new Response('{}', { status: 404 });
    }),
  );
  window.history.pushState({}, '', '/home');
  render(<App />);

  expect((await screen.findAllByText('House burger')).length).toBeGreaterThan(0);
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--vt-brand-primary')).toBe('#123456'),
  );
  /* No location yet: the header falls back to the brand name from the API. */
  expect(await screen.findByText('Test Brand')).toBeInTheDocument();
  const photo = document.querySelector('img[src="https://cdn.test/api/media/t/burger.webp"]');
  expect(photo).not.toBeNull();
  /* Nothing the API did not send: no deals block (no compare-at price), no promo banner. */
  expect(screen.queryByText('Deals')).toBeNull();
  expect(screen.queryByText(/promo/i)).toBeNull();
});
