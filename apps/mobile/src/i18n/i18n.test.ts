import { afterEach, describe, expect, test } from 'vitest';
import { en } from './en';
import { es } from './es';
import { formatMoney, resolveLanguage, setLanguage, t } from './index';

afterEach(() => setLanguage('en'));

describe('language', () => {
  test('the device language wins when the app speaks it', () => {
    expect(resolveLanguage({ deviceLanguages: ['es-CL', 'en-US'], brandDefault: 'en' })).toBe('es');
    expect(resolveLanguage({ deviceLanguages: ['en-GB'], brandDefault: 'es' })).toBe('en');
  });

  test('otherwise the brand default', () => {
    expect(resolveLanguage({ deviceLanguages: ['fr-FR', 'de'], brandDefault: 'es' })).toBe('es');
    expect(resolveLanguage({ deviceLanguages: [], brandDefault: 'en' })).toBe('en');
  });

  test('a valid ?lang= override wins, an invalid one is ignored', () => {
    expect(
      resolveLanguage({ override: 'ES', deviceLanguages: ['en-US'], brandDefault: 'en' }),
    ).toBe('es');
    expect(
      resolveLanguage({ override: 'xx', deviceLanguages: ['en-US'], brandDefault: 'es' }),
    ).toBe('en');
  });
});

describe('messages', () => {
  test('Spanish has every English key, none empty', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(es)) expect(value.trim()).not.toBe('');
  });

  test('placeholders survive translation', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
    }
  });

  test('interpolates and switches language', () => {
    expect(t('order.reference', { code: 'DB-1' })).toBe('Order #DB-1');
    setLanguage('es');
    expect(t('order.reference', { code: 'DB-1' })).toBe('Pedido #DB-1');
    expect(document.documentElement.lang).toBe('es');
  });

  test('no copy names a particular brand or dish', () => {
    const all = [...Object.values(en), ...Object.values(es)].join(' ').toLowerCase();
    for (const word of ['carolina', 'reaper', 'tender', 'nashville', 'chicken', 'pollo']) {
      expect(all).not.toContain(word);
    }
  });
});

describe('money', () => {
  test('uses the currency’s own decimals', () => {
    expect(formatMoney(8900, 'CLP')).toBe('$8,900');
    expect(formatMoney(12.9, 'USD')).toBe('$12.90');
  });

  test('an unknown currency does not throw', () => {
    expect(formatMoney(1, 'ZZZ')).toContain('1');
  });
});
