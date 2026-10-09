/**
 * Build-time brand: `brand.config.json` at the root of the app (written by the
 * brand generator, TASK-019), or the file named by `VENTEA_BRAND_FILE`.
 * Vite validates it with {@link parseBrandConfig} and injects it as
 * `__BRAND__`; `capacitor.config.ts` reads the same file for `appId`/`appName`.
 *
 * Only what must exist before the first request lives here. Colours, logo and
 * name are refreshed at runtime from `GET /api/tenant`, so a colour change in
 * the panel never needs a new store release.
 *
 * No zod on purpose: this module is also imported by `vite.config.ts`, and a
 * dozen fields are easier to read checked by hand.
 */

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface BrandConfig {
  /** Tenant this binary belongs to; sent as `X-Tenant-Slug`. */
  tenantSlug: string;
  /** API origin, without `/api`. */
  apiUrl: string;
  /** Name under the icon and in the header until `/api/tenant` answers. */
  appName: string;
  /** Store bundle id / Android applicationId. */
  bundleId: string;
  colors: {
    primary: string;
    secondary: string | null;
    accent: string | null;
  };
  logoUrl: string | null;
  iconUrl: string | null;
  /** Used when the device language is not one the app speaks. */
  defaultLanguage: Language;
  /** ISO 4217 until `/api/tenant` answers. */
  currency: string;
  push: {
    /**
     * Only true when the build ships the brand's Firebase config
     * (`google-services.json` / `GoogleService-Info.plist`). Without it the
     * native push plugin must never be called.
     */
    enabled: boolean;
  };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BUNDLE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const CURRENCY = /^[A-Z]{3}$/;

export class BrandConfigError extends Error {
  constructor(message: string) {
    super(`brand config: ${message}`);
    this.name = 'BrandConfigError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireString = (source: Record<string, unknown>, key: string, pattern?: RegExp): string => {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim())
    throw new BrandConfigError(`"${key}" is required`);
  if (pattern && !pattern.test(value))
    throw new BrandConfigError(`"${key}" is not valid: ${value}`);
  return value.trim();
};

const optionalColor = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !HEX.test(value)) {
    throw new BrandConfigError(`"colors.${key}" must be a hex colour`);
  }
  return value;
};

/** http(s) only: a logo URL is rendered in an <img>, never as script. */
const optionalUrl = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^https?:\/\/[^\s]+$/i.test(value)) {
    throw new BrandConfigError(`"${key}" must be an http(s) URL`);
  }
  return value;
};

export const parseBrandConfig = (input: unknown): BrandConfig => {
  if (!isRecord(input)) throw new BrandConfigError('must be a JSON object');
  const colors = input.colors;
  if (!isRecord(colors)) throw new BrandConfigError('"colors" is required');
  const primary = optionalColor(colors, 'primary');
  if (!primary) throw new BrandConfigError('"colors.primary" is required');

  const apiUrl = requireString(input, 'apiUrl');
  if (!/^https?:\/\/[^\s/]+(:\d+)?\/?$/i.test(apiUrl)) {
    throw new BrandConfigError('"apiUrl" must be an http(s) origin without a path');
  }

  const language = input.defaultLanguage ?? 'en';
  if (!LANGUAGES.includes(language as Language)) {
    throw new BrandConfigError(`"defaultLanguage" must be one of ${LANGUAGES.join(', ')}`);
  }

  const push = isRecord(input.push) ? input.push : {};

  return {
    tenantSlug: requireString(input, 'tenantSlug', SLUG),
    apiUrl: apiUrl.replace(/\/+$/, ''),
    appName: requireString(input, 'appName'),
    bundleId: requireString(input, 'bundleId', BUNDLE_ID),
    colors: {
      primary,
      secondary: optionalColor(colors, 'secondary'),
      accent: optionalColor(colors, 'accent'),
    },
    logoUrl: optionalUrl(input, 'logoUrl'),
    iconUrl: optionalUrl(input, 'iconUrl'),
    defaultLanguage: language as Language,
    currency: input.currency === undefined ? 'USD' : requireString(input, 'currency', CURRENCY),
    push: { enabled: push.enabled === true },
  };
};
