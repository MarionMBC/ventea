import { describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../api/storage';
import type { Tenant } from '../api/types';
import { brandFromTenant, createBrandStore } from './brandStore';
import { resolveMediaUrl } from './media';
import type { BrandState } from './runtime';
import { resolveApiUrl, resolveTenantSlug, slugFromHostname } from './runtime';

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

  test('the panel removing logo, icon or accent (null) clears them; absent fields keep', () => {
    const withAll: BrandState = {
      ...previous,
      logoUrl: 'https://cdn.test/logo.webp',
      iconUrl: 'https://cdn.test/icon.webp',
      colors: { ...previous.colors, accent: '#FDB913' },
    };
    const removed = brandFromTenant(
      withAll,
      tenant({ logoUrl: null, iconUrl: null, accentColor: null }),
      API,
    );
    expect(removed.logoUrl).toBeNull();
    expect(removed.iconUrl).toBeNull();
    expect(removed.colors.accent).toBeNull();
    /* An API without the TASK-016 fields (no iconUrl/accentColor keys) keeps them. */
    const old = brandFromTenant(withAll, tenant(), API);
    expect(old.iconUrl).toBe('https://cdn.test/icon.webp');
    expect(old.colors.accent).toBe('#FDB913');
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

describe('runtime: which brand', () => {
  const base = {
    baseDomain: 'ventea.tech',
    hostname: 'carolina-hot-chicken.ventea.tech',
    search: '',
    fallback: 'demo-burgers',
  };

  test('a native build always uses its own brand, whatever the host or query', () => {
    expect(
      resolveTenantSlug({
        ...base,
        native: true,
        dev: false,
        search: '?tenant=other',
        storage: memoryStorage(),
      }),
    ).toBe('demo-burgers');
  });

  test('production web: the brand is the subdomain, never the build brand', () => {
    expect(
      resolveTenantSlug({ ...base, native: false, dev: false, storage: memoryStorage() }),
    ).toBe('carolina-hot-chicken');
  });

  test('production web ignores ?tenant= (no re-branding someone else’s host)', () => {
    const storage = memoryStorage();
    storage.setItem('ventea.preview.tenant', 'other-brand');
    expect(
      resolveTenantSlug({ ...base, native: false, dev: false, search: '?tenant=evil', storage }),
    ).toBe('carolina-hot-chicken');
  });

  test.each([
    'ventea.tech',
    'app.ventea.tech',
    'www.ventea.tech',
    'api.ventea.tech',
    'a.b.ventea.tech',
    'evilventea.tech',
    'carolina.ventea.tech.evil.com',
    'localhost',
    '127.0.0.1',
  ])('production web on %s → no brand', (hostname) => {
    expect(
      resolveTenantSlug({ ...base, hostname, native: false, dev: false, storage: memoryStorage() }),
    ).toBe('');
  });

  test('slugFromHostname is case-insensitive and tolerates a trailing dot', () => {
    expect(slugFromHostname('Demo-Burgers.Ventea.Tech.', 'ventea.tech')).toBe('demo-burgers');
  });

  test('vite dev previews ?tenant= and remembers it', () => {
    const storage = memoryStorage();
    expect(
      resolveTenantSlug({
        ...base,
        hostname: 'localhost',
        native: false,
        dev: true,
        search: '?tenant=demo-burgers',
        storage,
      }),
    ).toBe('demo-burgers');
    expect(
      resolveTenantSlug({ ...base, hostname: 'localhost', native: false, dev: true, storage }),
    ).toBe('demo-burgers');
  });

  test('vite dev: an invalid ?tenant= falls back to the build brand', () => {
    expect(
      resolveTenantSlug({
        ...base,
        hostname: 'localhost',
        native: false,
        dev: true,
        search: '?tenant=../x',
        storage: memoryStorage(),
      }),
    ).toBe('demo-burgers');
  });
});

describe('runtime: which API', () => {
  const brandUrl = 'https://api.ventea.tech';

  test('production web is always same-origin, env or not', () => {
    expect(resolveApiUrl({ native: false, dev: false, envUrl: undefined, brandUrl })).toBe('');
    expect(
      resolveApiUrl({ native: false, dev: false, envUrl: 'https://api.ventea.tech', brandUrl }),
    ).toBe('');
  });

  test('native: env, else the brand API', () => {
    expect(resolveApiUrl({ native: true, dev: false, envUrl: undefined, brandUrl })).toBe(brandUrl);
    expect(resolveApiUrl({ native: true, dev: false, envUrl: 'https://x.test/', brandUrl })).toBe(
      'https://x.test',
    );
  });

  test('vite dev: env, else the dev server proxy', () => {
    expect(resolveApiUrl({ native: false, dev: true, envUrl: undefined, brandUrl })).toBe('');
    expect(
      resolveApiUrl({ native: false, dev: true, envUrl: 'http://localhost:3000/', brandUrl }),
    ).toBe('http://localhost:3000');
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
