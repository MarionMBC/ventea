import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { en } from './en';
import { es } from './es';
import {
  browserLang,
  createI18n,
  I18nProvider,
  initialLang,
  LANG_STORAGE_KEY,
  useI18n,
} from './I18nProvider';
import { ApiError } from '@/lib/api';

import { describeError } from './errors';
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

  it('every key is used by the panel (no dead translations)', () => {
    const files = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const code = Object.entries(files)
      .filter(([path]) => !/\/i18n\/(en|es)\.ts$/.test(path))
      .map(([, source]) => source)
      .join('\n');
    expect(Object.keys(files).length).toBeGreaterThan(20);
    // Keys built at runtime: `role.${role}`, `plan.${code}`, `fulfillment.${type}`…
    const dynamic = [...code.matchAll(/`([a-z]+)\.\$\{/gi)].map((m) => `${m[1]}.`);
    const unused = Object.keys(en)
      .map((key) => key.replace(/_(one|other)$/, ''))
      .filter((key) => !code.includes(`'${key}'`) && !dynamic.some((p) => key.startsWith(p)));
    expect([...new Set(unused)]).toEqual([]);
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
  it('first visit: the browser language (es-*) picks Spanish, without storing it', () => {
    expect(browserLang(['es-HN', 'en'])).toBe('es');
    expect(browserLang(['fr-FR', 'en-US'])).toBe('en');
    expect(browserLang(['fr-FR'])).toBeNull();
    expect(initialLang('', ['es-419'])).toBe('es');
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBeNull();
    expect(initialLang('', ['de-DE'])).toBe('en');
    // A saved choice wins over the browser.
    window.localStorage.setItem(LANG_STORAGE_KEY, 'en');
    expect(initialLang('', ['es-HN'])).toBe('en');
  });

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

describe('describeError', () => {
  const en = createI18n('en');
  const es = createI18n('es');
  const api = (status: number, message: string) => new ApiError(status, message);

  it('en inglés, un mensaje escrito por la API (en español) se traduce por status', () => {
    expect(describeError(api(400, 'El campo es obligatorio'), en)).toBe(en.t('errors.badRequest'));
    expect(describeError(api(403, 'Tu rol no permite esta acción'), en)).toBe(
      en.t('errors.forbidden'),
    );
    expect(describeError(api(404, 'Pedido no encontrado'), en)).toBe(en.t('errors.notFound'));
    expect(describeError(api(409, 'El plan Básico permite 1'), en)).toBe(en.t('errors.conflict'));
    expect(describeError(api(429, 'Demasiados intentos'), en)).toBe(en.t('errors.tooMany'));
    expect(describeError(api(503, 'Servicio no disponible'), en)).toBe(
      'The server didn’t respond correctly (503). Please try again.',
    );
  });

  it('en español se muestra el motivo exacto de la API', () => {
    expect(describeError(api(409, 'El plan Básico permite 1 sucursal'), es)).toBe(
      'El plan Básico permite 1 sucursal',
    );
  });

  it('un status sin clave cae al mensaje del servidor', () => {
    expect(describeError(api(418, 'Soy una tetera'), en)).toBe('Soy una tetera');
  });

  it('402 (suscripción suspendida): texto propio del panel en los dos idiomas', () => {
    expect(describeError(api(402, 'Servicio suspendido'), en)).toBe(en.t('errors.paymentRequired'));
    expect(describeError(api(402, 'Servicio suspendido'), es)).toBe(es.t('errors.paymentRequired'));
    expect(en.t('errors.paymentRequired')).toMatch(/suspended/);
  });

  it('un 401 explicado por la API no es «sesión expirada»', () => {
    expect(describeError(api(401, 'Token de cliente en ruta de staff'), en)).toBe(
      en.t('errors.unauthorized'),
    );
    expect(describeError(api(401, 'Token de cliente en ruta de staff'), en)).not.toBe(
      en.t('errors.sessionExpired'),
    );
    expect(describeError(api(401, 'Motivo propio'), es)).toBe('Motivo propio');
  });

  it('plan_limit: traducido con el plan y el tope, no el texto genérico', () => {
    const locations = new ApiError(
      403,
      'El plan Básico permite hasta 1 sucursal activa',
      undefined,
      'plan_limit',
      {
        resource: 'locations',
        plan: 'basic',
        planName: 'Básico',
        max: 1,
      },
    );
    expect(describeError(locations, en)).toBe(
      'Your Basic plan allows 1 active location. Upgrade your plan to add more.',
    );
    expect(describeError(locations, es)).toBe(
      'Tu plan Básico permite 1 sucursal activa. Sube de plan para agregar más.',
    );
    const app = new ApiError(403, 'x', undefined, 'plan_limit', {
      resource: 'branded_app',
      plan: 'basic',
      planName: 'Básico',
      max: null,
    });
    expect(describeError(app, en)).toMatch(/Basic plan doesn’t include your own app/);
    expect(describeError(app, es)).toMatch(/Tu plan Básico no incluye app propia/);
  });

  it('errores propios del panel y errores que no son de la API', () => {
    expect(describeError(new ApiError(0, 'x', 'network'), es)).toBe(es.t('errors.network'));
    expect(describeError(new ApiError(401, 'x', 'session'), en)).toBe(
      en.t('errors.sessionExpired'),
    );
    expect(describeError(new ApiError(418, 'x', 'fallback'), en)).toBe(
      en.t('errors.http', { status: 418 }),
    );
    expect(describeError(new Error('boom'), en)).toBe(en.t('errors.unexpected'));
  });
});
