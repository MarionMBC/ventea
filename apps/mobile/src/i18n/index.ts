import type { Language } from '../brand/brandConfig';
import { LANGUAGES } from '../brand/brandConfig';
import { en } from './en';
import type { MessageKey } from './en';
import { es } from './es';

export type { MessageKey } from './en';

/**
 * Tiny i18n: two dictionaries checked by the compiler (`es` must have every
 * key of `en`), `{name}` placeholders and Intl for money and dates. No
 * library: the app speaks two languages and never switches mid-session.
 *
 * Language: `?lang=` (web preview only) → the first device language the app
 * speaks → the brand's default (`brand.config.json`).
 */

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, es };

/** BCP 47 tags for Intl: Latin-American Spanish, US English. */
const INTL_LOCALE: Record<Language, string> = { en: 'en-US', es: 'es-419' };

let current: Language = 'en';

const isLanguage = (value: string | null | undefined): value is Language =>
  !!value && (LANGUAGES as readonly string[]).includes(value);

export const resolveLanguage = ({
  override,
  deviceLanguages,
  brandDefault,
}: {
  override?: string | null;
  deviceLanguages: readonly string[];
  brandDefault: Language;
}): Language => {
  const requested = override?.trim().toLowerCase();
  if (isLanguage(requested)) return requested;
  for (const tag of deviceLanguages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return brandDefault;
};

export const setLanguage = (language: Language): void => {
  current = language;
  if (typeof document !== 'undefined') document.documentElement.lang = language;
};

export const getLanguage = (): Language => current;

export const intlLocale = (): string => INTL_LOCALE[current];

export type MessageVars = Record<string, string | number>;

export const t = (key: MessageKey, vars?: MessageVars): string => {
  const template = dictionaries[current][key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
};

/** Money in the brand's currency; `value` in currency units (cents / 100). */
export const formatMoney = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(value);
  } catch {
    /* An unknown currency code must not take the screen down. */
    return `${currency} ${value.toFixed(2)}`;
  }
};

export const formatDate = (iso: string, options: Intl.DateTimeFormatOptions): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(intlLocale(), options).format(date);
};
