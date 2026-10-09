import type { KeyValueStorage } from '../api/storage';
import type { Tenant } from '../api/types';
import { isHexColor } from './color';
import { resolveMediaUrl } from './media';
import type { BrandState } from './runtime';
import { API_URL, brandCacheStorage, initialBrandState, storageKey } from './runtime';
import { applyTheme, deriveTheme } from './theme';

/**
 * The brand the app is wearing right now, outside React so non-React code
 * (the price formatter, the native status bar) can read it.
 *
 * Boot: last `/api/tenant` seen on this device for this brand (so a colour
 * changed in the panel shows from the second launch on without a flash), else
 * the build config. Then `GET /api/tenant` refreshes it: name, colours, logo,
 * icon and currency come from the API whenever it answers.
 */

const CACHE_KEY = 'tenant';

export interface BrandStore {
  get: () => BrandState;
  /** Merges what the API said; fields it does not send keep their value. */
  applyTenant: (tenant: Tenant) => void;
  subscribe: (listener: () => void) => () => void;
}

const readCache = (storage: KeyValueStorage | null, key: string): BrandState | null => {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    const candidate = parsed as Partial<BrandState> | null;
    if (
      candidate &&
      typeof candidate.slug === 'string' &&
      typeof candidate.appName === 'string' &&
      typeof candidate.currency === 'string' &&
      candidate.colors &&
      isHexColor(candidate.colors.primary)
    ) {
      return candidate as BrandState;
    }
  } catch {
    /* A corrupt cache is just no cache. */
  }
  return null;
};

/**
 * `/api/tenant` → brand state. A field the API does not send at all
 * (`undefined`: an API from before TASK-016) keeps the previous value; a field
 * sent as `null` means the brand removed it (logo, icon, accent) and clears it.
 * An invalid value counts as removed for optional fields and is ignored for the
 * required primary colour.
 */
export const brandFromTenant = (
  previous: BrandState,
  tenant: Tenant,
  apiUrl: string,
): BrandState => {
  const branding = tenant.branding ?? ({} as Partial<Tenant['branding']>);
  const optionalColor = (value: unknown, kept: string | null) =>
    value === undefined ? kept : isHexColor(value) ? value : null;
  const optionalMedia = (value: string | null | undefined, kept: string | null) =>
    value === undefined ? kept : (resolveMediaUrl(value, apiUrl) ?? null);
  return {
    slug: previous.slug,
    appName: branding.appDisplayName?.trim() || tenant.name || previous.appName,
    logoUrl: optionalMedia(branding.logoUrl, previous.logoUrl),
    iconUrl: optionalMedia(branding.iconUrl, previous.iconUrl),
    currency: /^[A-Z]{3}$/.test(tenant.currency ?? '') ? tenant.currency : previous.currency,
    colors: {
      primary: isHexColor(branding.primaryColor) ? branding.primaryColor : previous.colors.primary,
      secondary: optionalColor(branding.secondaryColor, previous.colors.secondary ?? null),
      accent: optionalColor(branding.accentColor, previous.colors.accent ?? null),
    },
  };
};

export const createBrandStore = ({
  storage,
  cacheKey,
  apiUrl,
  apply = (state: BrandState) => applyTheme(deriveTheme(state.colors)),
}: {
  storage: KeyValueStorage | null;
  cacheKey: string;
  apiUrl: string;
  apply?: (state: BrandState) => void;
}): BrandStore => {
  let state = initialBrandState(readCache(storage, cacheKey));
  const listeners = new Set<() => void>();
  apply(state);

  return {
    get: () => state,
    applyTenant: (tenant) => {
      state = brandFromTenant(state, tenant, apiUrl);
      try {
        storage?.setItem(cacheKey, JSON.stringify(state));
      } catch {
        /* Not cached this run. */
      }
      apply(state);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const brandStore = createBrandStore({
  storage: brandCacheStorage(),
  cacheKey: storageKey(CACHE_KEY),
  apiUrl: API_URL,
  apply: (state) => {
    if (typeof document === 'undefined') return;
    applyTheme(deriveTheme(state.colors));
    if (state.appName) document.title = state.appName;
  },
});
