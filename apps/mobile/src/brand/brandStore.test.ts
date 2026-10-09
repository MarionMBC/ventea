import { describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../api/storage';
import type { Tenant } from '../api/types';
import { brandFromTenant, createBrandStore } from './brandStore';
import { resolveMediaUrl } from './media';
import type { BrandState } from './runtime';
import { resolveApiUrl, resolveTenantSlug } from './runtime';

const API = 'https://api.test';

const previous: BrandState = {
  slug: 'demo-burgers',
  appName: 'Demo Burgers',
  logoUrl: null,
  iconUrl: null,
  currency: 'USD',
  colors: { primary: '#2E6FE2', secondary: '#1F1D1B', accent: null },
};

const tenant = (
  branding: Partial<Tenant['branding']> = {},
  extra: Partial<Tenant> = {},
): Tenant => ({
  slug: 'demo-burgers',
  name: 'Demo Burgers',
  currency: 'CLP',
  branding: {
    primaryColor: '#123456',
    secondaryColor: '#1F1D1B',
    logoUrl: null,
    appDisplayName: 'Demo Burgers App',
    ...branding,
  },
  rewardProgram: {
    isEnabled: true,
    pointsPerCurrencyUnit: 1,
    redemptionValueCents: 1,
    minPointsToRedeem: 100,
    signupBonusPoints: 50,
  },
  ...extra,
});

describe('brand from /api/tenant', () => {
  test('name, colours, currency and media come from the API', () => {
    const state = brandFromTenant(
      previous,
      tenant({
        accentColor: '#FDB913',
        logoUrl: 'https://cdn.test/api/media/t/logo.webp',
        iconUrl: '/api/media/t/icon.webp',
      }),
      API,
    );
    expect(state).toMatchObject({
      appName: 'Demo Burgers App',
      currency: 'CLP',
      logoUrl: 'https://cdn.test/api/media/t/logo.webp',
      iconUrl: 'https://api.test/api/media/t/icon.webp',
      colors: { primary: '#123456', secondary: '#1F1D1B', accent: '#FDB913' },
    });
  });

  test('degrades when the TASK-016 fields are absent or invalid', () => {
    const state = brandFromTenant(
      previous,
      tenant({ appDisplayName: null, primaryColor: 'nope' }),
      API,
    );
    expect(state.appName).toBe('Demo Burgers');
    expect(state.colors.primary).toBe('#2E6FE2');
    expect(state.colors.accent).toBeNull();
    expect(state.iconUrl).toBeNull();
  });

  test('never takes an unsafe logo URL', () => {
    expect(
      brandFromTenant(previous, tenant({ logoUrl: 'javascript:alert(1)' }), API).logoUrl,
    ).toBeNull();
  });
});

describe('brand store', () => {
  test('applies the theme at boot and on every refresh, and caches it', () => {
    const storage = memoryStorage();
    const apply = vi.fn();
    const store = createBrandStore({ storage, cacheKey: 'k', apiUrl: API, apply });
    expect(apply).toHaveBeenCalledTimes(1);
    const listener = vi.fn();
    store.subscribe(listener);

    store.applyTenant(tenant());

    expect(apply).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().colors.primary).toBe('#123456');
    expect(JSON.parse(storage.getItem('k') ?? '{}')).toMatchObject({ currency: 'CLP' });
  });

  test('the next launch starts from the cached brand', () => {
    const storage = memoryStorage();
    createBrandStore({ storage, cacheKey: 'k', apiUrl: API, apply: () => undefined }).applyTenant(
      tenant(),
    );
    const next = createBrandStore({ storage, cacheKey: 'k', apiUrl: API, apply: () => undefined });
    expect(next.get().colors.primary).toBe('#123456');
  });

  test('a corrupt cache is ignored', () => {
    const storage = memoryStorage();
    storage.setItem('k', '{"slug":1}');
    const store = createBrandStore({ storage, cacheKey: 'k', apiUrl: API, apply: () => undefined });
    expect(store.get().slug).toBe(__BRAND__.tenantSlug);
  });
});

describe('runtime', () => {
  test('a native build always uses its own brand', () => {
    expect(
      resolveTenantSlug({
        native: true,
        search: '?tenant=other',
        storage: memoryStorage(),
        fallback: 'mine',
      }),
    ).toBe('mine');
  });

  test('the web preview takes ?tenant= and remembers it', () => {
    const storage = memoryStorage();
    expect(
      resolveTenantSlug({
        native: false,
        search: '?tenant=demo-burgers',
        storage,
        fallback: 'mine',
      }),
    ).toBe('demo-burgers');
    expect(resolveTenantSlug({ native: false, search: '', storage, fallback: 'mine' })).toBe(
      'demo-burgers',
    );
  });

  test('an invalid ?tenant= is ignored', () => {
    expect(
      resolveTenantSlug({
        native: false,
        search: '?tenant=../x',
        storage: memoryStorage(),
        fallback: 'mine',
      }),
    ).toBe('mine');
  });

  test('API URL: env wins, dev uses the proxy, builds use the brand', () => {
    expect(
      resolveApiUrl({ envUrl: 'http://localhost:3000/', dev: true, brandUrl: 'https://b' }),
    ).toBe('http://localhost:3000');
    expect(resolveApiUrl({ envUrl: undefined, dev: true, brandUrl: 'https://b' })).toBe('');
    expect(resolveApiUrl({ envUrl: undefined, dev: false, brandUrl: 'https://b' })).toBe(
      'https://b',
    );
  });
});

describe('media URLs', () => {
  test.each([
    ['https://cdn.test/a.webp', 'https://cdn.test/a.webp'],
    ['/api/media/t/a.webp', 'https://api.test/api/media/t/a.webp'],
    ['//evil.test/a.webp', undefined],
    ['/\\evil.test', undefined],
    ['data:image/png;base64,AAAA', undefined],
    ['javascript:alert(1)', undefined],
    ['', undefined],
    [null, undefined],
  ])('%s → %s', (input, expected) => {
    expect(resolveMediaUrl(input, API)).toBe(expected);
  });
});
