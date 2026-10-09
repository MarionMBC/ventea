import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { en } from './en';
import { es } from './es';
import { createI18n, I18nProvider, initialLang, LANG_STORAGE_KEY, useI18n } from './I18nProvider';
import { slotsOf, translate, translateRich } from './translate';

describe('dictionaries', () => {
  it('Spanish has exactly the English keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('every translation keeps the same interpolation slots and is not empty', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(es[key].trim(), key).not.toBe('');
      expect(slotsOf(es[key]), key).toEqual(slotsOf(en[key]));
    }
  });

  it('plural keys always come in _one/_other pairs', () => {
    const keys = Object.keys(en);
    for (const key of keys.filter((k) => k.endsWith('_one'))) {
      expect(keys).toContain(key.replace(/_one$/, '_other'));
    }
  });
});

describe('translate', () => {
  it('interpolates and picks the plural form', () => {
    expect(translate('en', 'orders.count', { count: 1 })).toBe('1 order');
    expect(translate('en', 'orders.count', { count: 3 })).toBe('3 orders');
    expect(translate('es', 'orders.count', { count: 1 })).toBe('1 pedido');
    expect(translate('es', 'orders.count', { count: 0 })).toBe('0 pedidos');
    expect(translate('en', 'card.cancelAria', { code: 'CHC-1' })).toBe('Cancel order CHC-1');
  });

  it('a missing slot stays visible instead of printing «undefined»', () => {
    expect(translate('en', 'card.cancelAria')).toBe('Cancel order {code}');
  });

  it('rich slots accept React nodes', () => {
    render(<p>{translateRich('en', 'billing.paymentNote', { email: <a href="#x">hi</a> })}</p>);
    expect(screen.getByRole('link', { name: 'hi' })).toBeTruthy();
    expect(screen.getByText(/Payments are coordinated/)).toBeTruthy();
  });

  it('formats dates, time and money per language', () => {
    const at = new Date(2026, 9, 8, 14, 5);
    expect(createI18n('en').clock(at)).toMatch(/2:05\s?PM/);
    expect(createI18n('en').money(2580, 'USD')).toBe('$25.80');
    expect(createI18n('es').money(2580, 'HNL')).toBe('L 25.80');
    expect(createI18n('en').day(at)).toBe('Oct 08, 2026');
    expect(createI18n('es').day(at)).toBe('08 de oct de 2026');
  });

  it('elapsed time and customer names', () => {
    const i18n = createI18n('en');
    const placed = new Date('2026-10-08T15:00:00Z');
    const at = (min: number) => placed.getTime() + min * 60_000;
    expect(i18n.elapsed(placed, at(0))).toBe('now');
    expect(i18n.elapsed(placed, at(7))).toBe('7 min');
    expect(i18n.elapsed(placed, at(60))).toBe('1 h');
    expect(i18n.elapsed(placed, at(65))).toBe('1 h 5 min');
    expect(i18n.ago(placed, at(7))).toBe('7 min ago');
    expect(createI18n('es').ago(placed, at(7))).toBe('hace 7 min');
    expect(i18n.customerName(null)).toBe('Guest customer');
    expect(i18n.customerName({ firstName: 'Ana', lastName: null, phone: null })).toBe('Ana');
    expect(createI18n('es').customerName({ firstName: null, lastName: null, phone: '1' })).toBe(
      'Cliente sin nombre',
    );
  });
});

describe('language selection', () => {
  it('defaults to English; ?lang=es wins and is remembered', () => {
    expect(initialLang('')).toBe('en');
    expect(initialLang('?lang=es')).toBe('es');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('es');
    expect(initialLang('')).toBe('es');
    expect(initialLang('?lang=xx')).toBe('es');
  });

  it('switching language re-renders, persists and updates <html lang>', () => {
    function Probe() {
      const { t, lang, setLang } = useI18n();
      return (
        <button type="button" onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>
          {t('nav.orders')}
        </button>
      );
    }
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('en');
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Orders' })));
    expect(screen.getByRole('button', { name: 'Pedidos' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('es');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe('es');
  });

  it('works when localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(initialLang('')).toBe('en');
      expect(initialLang('?lang=es')).toBe('es');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});
