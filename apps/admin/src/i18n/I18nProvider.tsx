import type { StaffOrder } from '@ventea/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { formatAmount, formatClock, minutesSince } from '@/lib/format';

import {
  DEFAULT_LANG,
  isLang,
  LOCALES,
  translate,
  translateRich,
  type Lang,
  type TKey,
  type Vars,
} from './translate';

export const LANG_STORAGE_KEY = 'ventea.admin.lang';

/** Everything a screen needs to speak the viewer's language. */
export interface I18n {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
  /** Like `t`, with React nodes in the slots (links, bold text). */
  rich: (key: TKey, vars: Record<string, ReactNode>) => ReactNode;
  /** Money in the brand currency (or just the number while the brand loads). */
  money: (cents: number, currency: string | undefined) => string;
  clock: (date: Date) => string;
  day: (date: Date) => string;
  dateTime: (date: Date) => string;
  /** Compact elapsed time: «now», «7 min», «1 h 5 min». */
  elapsed: (from: Date, now: number) => string;
  /** «just now» / «7 min ago». */
  ago: (from: Date, now: number) => string;
  customerName: (customer: StaffOrder['customer']) => string;
}

function readStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}

/** First browser language we speak (`es-HN` → es), if any. Not stored: it is not a choice. */
export function browserLang(
  languages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language],
): Lang | null {
  for (const tag of languages) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return null;
}

/**
 * `?lang=es` wins (and is remembered), then the saved choice, then the browser's language
 * (first visit), then English.
 */
export function initialLang(
  search = typeof window === 'undefined' ? '' : window.location.search,
  languages?: readonly string[],
) {
  const fromUrl = new URLSearchParams(search).get('lang');
  if (isLang(fromUrl)) {
    storeLang(fromUrl);
    return fromUrl;
  }
  return readStoredLang() ?? browserLang(languages) ?? DEFAULT_LANG;
}

export function createI18n(lang: Lang, setLang: (lang: Lang) => void = () => {}): I18n {
  const locale = LOCALES[lang];
  const t = (key: TKey, vars?: Vars) => translate(lang, key, vars);
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const dateTime = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const elapsed = (from: Date, now: number) => {
    const minutes = minutesSince(from, now);
    if (minutes < 1) return t('time.now');
    if (minutes < 60) return t('time.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0
      ? t('time.hours', { hours })
      : t('time.hoursMinutes', { hours, minutes: rest });
  };
  return {
    lang,
    locale,
    setLang,
    t,
    rich: (key, vars) => translateRich(lang, key, vars),
    money: (cents, currency) => formatAmount(cents, currency, locale),
    clock: (date) => formatClock(date, locale),
    day: (date) => day.format(date),
    dateTime: (date) => dateTime.format(date),
    elapsed,
    ago: (from, now) =>
      minutesSince(from, now) < 1
        ? t('time.justNow')
        : t('time.ago', { elapsed: elapsed(from, now) }),
    customerName: (customer) => {
      if (!customer) return t('customer.guest');
      const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
      return name || t('customer.unnamed');
    },
  };
}

/** Without a provider (isolated component tests) the panel speaks English. */
const I18nContext = createContext<I18n>(createI18n(DEFAULT_LANG));

export function I18nProvider({ children, lang: forced }: { children: ReactNode; lang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => forced ?? initialLang());

  const setLang = useCallback((next: Lang) => {
    storeLang(next);
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => createI18n(lang, setLang), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** The translate function for the current language. */
export function useT(): I18n['t'] {
  return useContext(I18nContext).t;
}
