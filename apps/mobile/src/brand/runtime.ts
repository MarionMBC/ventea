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

/** Subdomains of the platform that are never a brand (nginx serves them other sites). */
export const NON_BRAND_SUBDOMAINS: readonly string[] = ['app', 'www', 'api'];

/**
 * `<slug>.<baseDomain>` → slug. The apex, the platform subdomains and any
 * other host give null: a brand is only ever its own subdomain.
 */
export const slugFromHostname = (hostname: string, baseDomain: string): string | null => {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!SLUG.test(label) || label.length > 63 || NON_BRAND_SUBDOMAINS.includes(label)) return null;
  return label;
};

/**
 * Which brand this run is:
 *
 * - native binary → always the brand it was built for (`brand.config.json`);
 * - production web (the public menu at `<slug>.ventea.tech`, served by nginx)
 *   → the brand of the hostname; any other host → none ('');
 * - `vite dev` → `?tenant=<slug>` previews any brand (kept in sessionStorage
 *   so in-app navigation keeps it), else the build brand. Never in production:
 *   a query string must not re-brand somebody else's subdomain.
 */
export const resolveTenantSlug = ({
  native,
  dev,
  hostname,
  baseDomain,
  search,
  storage,
  fallback,
}: {
  native: boolean;
  dev: boolean;
  hostname: string;
  baseDomain: string;
  search: string;
  storage: KeyValueStorage | null;
  fallback: string;
}): string => {
  if (native) return fallback;
  if (!dev) return slugFromHostname(hostname, baseDomain) ?? '';
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
 * API origin:
 * - native → `VITE_API_URL`, else the brand's `apiUrl`;
 * - `vite dev` → `VITE_API_URL`, else the dev server itself, whose proxy
 *   forwards `/api` to `API_PROXY_TARGET` (default `http://localhost:3000`);
 * - production web → always the same origin (`/api` of `<slug>.ventea.tech`,
 *   routed by Traefik; the host picks the tenant and the CSP `connect-src
 *   'self'` holds). No env can point it elsewhere.
 */
export const resolveApiUrl = ({
  native,
  dev,
  envUrl,
  brandUrl,
}: {
  native: boolean;
  dev: boolean;
  envUrl: string | undefined;
  brandUrl: string;
}): string => {
  const env = envUrl ? envUrl.replace(/\/+$/, '') : '';
  if (native) return env || brandUrl;
  if (dev) return env;
  return '';
};

export const IS_NATIVE = Capacitor.isNativePlatform();

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'ventea.tech';

export const TENANT_SLUG = resolveTenantSlug({
  native: IS_NATIVE,
  dev: import.meta.env.DEV,
  hostname: typeof window !== 'undefined' ? window.location.hostname : '',
  baseDomain: BASE_DOMAIN,
  search: typeof window !== 'undefined' ? window.location.search : '',
  storage: sessionStorageOrNull(),
  fallback: BUILD_BRAND.tenantSlug,
});

/** False on a host that is no brand's: the app shows a neutral notice and calls nothing. */
export const HAS_BRAND = TENANT_SLUG !== '';

/** True when this run is the brand the build was made for (native, or dev without ?tenant=). */
export const IS_BUILD_BRAND = TENANT_SLUG === BUILD_BRAND.tenantSlug;

export const API_URL = resolveApiUrl({
  native: IS_NATIVE,
  dev: import.meta.env.DEV,
  envUrl: import.meta.env.VITE_API_URL,
  brandUrl: BUILD_BRAND.apiUrl,
});

/** Per-brand storage key: one browser can hold several brands without crossing sessions. */
export const storageKey = (name: string): string => `ventea.${TENANT_SLUG || 'none'}.${name}`;

/** Neutral look until another brand's `/api/tenant` answers (never another brand's colours). */
const NEUTRAL_COLORS: BrandColors = { primary: '#6B6B6B', secondary: null, accent: null };

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
 * First paint: this brand's last known look (cached from `/api/tenant`), else
 * the build brand when it is the same one, else neutral values.
 */
export const initialBrandState = (cached: BrandState | null): BrandState => {
  if (cached && cached.slug === TENANT_SLUG) return cached;
  if (IS_BUILD_BRAND) {
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
    colors: NEUTRAL_COLORS,
  };
};

export const brandCacheStorage = localStorageOrNull;
