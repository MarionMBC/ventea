import { Capacitor } from '@capacitor/core';
import type { KeyValueStorage } from '../api/storage';
import { localStorageOrNull, sessionStorageOrNull } from '../api/storage';
import type { BrandConfig } from './brandConfig';
import type { BrandColors } from './theme';

/**
 * Which brand this run of the app is, and where its API lives.
 *
 * - Native build: always the brand it was built for (`__BRAND__`). One binary,
 *   one brand: a deep link can never switch the tenant.
 * - Web preview (`npm run dev -w @ventea/mobile`): `?tenant=<slug>` previews any
 *   brand. The choice is kept in sessionStorage so in-app navigation (which
 *   drops the query) stays on it.
 */

/** Injected by Vite from `brand.config.json` (see vite.config.ts). */
export const BUILD_BRAND: BrandConfig = __BRAND__;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+){0,20}$/;
const PREVIEW_KEY = 'ventea.preview.tenant';

export const resolveTenantSlug = ({
  native,
  search,
  storage,
  fallback,
}: {
  native: boolean;
  search: string;
  storage: KeyValueStorage | null;
  fallback: string;
}): string => {
  if (native) return fallback;
  const requested = new URLSearchParams(search).get('tenant')?.trim().toLowerCase();
  if (requested && SLUG.test(requested) && requested.length <= 63) {
    try {
      storage?.setItem(PREVIEW_KEY, requested);
    } catch {
      /* Preview still works for this page load. */
    }
    return requested;
  }
  try {
    const stored = storage?.getItem(PREVIEW_KEY);
    if (stored && SLUG.test(stored)) return stored;
  } catch {
    /* Fall through to the build brand. */
  }
  return fallback;
};

/**
 * API origin. `VITE_API_URL` wins; in `vite dev` the default is the dev
 * server itself (same origin), whose proxy forwards `/api` to
 * `API_PROXY_TARGET` (default `http://localhost:3000`) — no CORS involved.
 * A production build uses the brand's `apiUrl`.
 */
export const resolveApiUrl = ({
  envUrl,
  dev,
  brandUrl,
}: {
  envUrl: string | undefined;
  dev: boolean;
  brandUrl: string;
}): string => (envUrl ? envUrl.replace(/\/+$/, '') : dev ? '' : brandUrl);

export const IS_NATIVE = Capacitor.isNativePlatform();

export const TENANT_SLUG = resolveTenantSlug({
  native: IS_NATIVE,
  search: typeof window !== 'undefined' ? window.location.search : '',
  storage: sessionStorageOrNull(),
  fallback: BUILD_BRAND.tenantSlug,
});

/** True when the web preview shows a brand other than the build's. */
export const IS_PREVIEW_OF_OTHER_BRAND = TENANT_SLUG !== BUILD_BRAND.tenantSlug;

export const API_URL = resolveApiUrl({
  envUrl: import.meta.env.VITE_API_URL,
  dev: import.meta.env.DEV,
  brandUrl: BUILD_BRAND.apiUrl,
});

/** Per-brand storage key: the web preview can hold several brands in one browser. */
export const storageKey = (name: string): string => `ventea.${TENANT_SLUG}.${name}`;

/** The brand as the app shows it right now. */
export interface BrandState {
  slug: string;
  appName: string;
  logoUrl: string | null;
  iconUrl: string | null;
  currency: string;
  colors: BrandColors;
}

/**
 * First paint: the build brand, or — when previewing another brand — neutral
 * values with that brand's last known look (cached from `/api/tenant`).
 */
export const initialBrandState = (cached: BrandState | null): BrandState => {
  if (cached && cached.slug === TENANT_SLUG) return cached;
  if (!IS_PREVIEW_OF_OTHER_BRAND) {
    return {
      slug: TENANT_SLUG,
      appName: BUILD_BRAND.appName,
      logoUrl: BUILD_BRAND.logoUrl,
      iconUrl: BUILD_BRAND.iconUrl,
      currency: BUILD_BRAND.currency,
      colors: BUILD_BRAND.colors,
    };
  }
  return {
    slug: TENANT_SLUG,
    appName: '',
    logoUrl: null,
    iconUrl: null,
    currency: BUILD_BRAND.currency,
    colors: BUILD_BRAND.colors,
  };
};

export const brandCacheStorage = localStorageOrNull;
