import { Fragment, createElement, type ReactNode } from 'react';

import { en, type Messages } from './en';
import { es } from './es';

/** Supported panel languages. English is the default. */
export const LANGS = ['en', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

export const DICTIONARIES: Record<Lang, Messages> = { en, es };

/** BCP-47 locale used by `Intl` for dates, times and money. */
export const LOCALES: Record<Lang, string> = { en: 'en-US', es: 'es-HN' };

type Key = keyof Messages;
type PluralBase<K> = K extends `${infer B}_other` ? B : never;
/** A translatable key: a plain key, or the base of a `_one` / `_other` pair. */
export type TKey = Exclude<Key, `${string}_one` | `${string}_other`> | PluralBase<Key>;

export type Vars = Record<string, string | number>;

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

const pluralRules = new Map<Lang, Intl.PluralRules>();
function pluralCategory(lang: Lang, count: number): string {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(LOCALES[lang]);
    pluralRules.set(lang, rules);
  }
  return rules.select(count);
}

/** Resolves the template for `key` (picking the plural form from `vars.count`). */
function template(lang: Lang, key: TKey, vars?: Vars): string {
  const dict = DICTIONARIES[lang] as Record<string, string>;
  if (typeof vars?.count === 'number' && `${key}_other` in dict) {
    const form = pluralCategory(lang, vars.count) === 'one' ? 'one' : 'other';
    return dict[`${key}_${form}`] ?? dict[`${key}_other`]!;
  }
  // Missing in this language (should never happen: a test checks parity) → English → key.
  return dict[key] ?? (en as Record<string, string>)[key] ?? key;
}

const SLOT = /\{(\w+)\}/g;

/** `{name}` slots replaced by `vars`; unknown slots stay visible to make them easy to spot. */
export function translate(lang: Lang, key: TKey, vars?: Vars): string {
  return template(lang, key, vars).replace(SLOT, (match, name: string) =>
    vars && name in vars ? String(vars[name]) : match,
  );
}

/** Like `translate`, but slots can be React nodes (links, bold text). */
export function translateRich(lang: Lang, key: TKey, vars: Record<string, ReactNode>): ReactNode {
  const parts = template(lang, key, vars as Vars).split(SLOT);
  // `split` with a capture group alternates text, slot name, text, slot name…
  return parts.map((part, index) =>
    index % 2 === 0
      ? part
      : createElement(Fragment, { key: index }, part in vars ? vars[part] : `{${part}}`),
  );
}

/** Slot names used in a template (for the dictionary parity test). */
export function slotsOf(text: string): string[] {
  return [...text.matchAll(SLOT)].map((m) => m[1]!).sort();
}
