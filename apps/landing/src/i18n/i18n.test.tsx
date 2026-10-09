import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { buildDemoMailto, DemoRequest } from '@/landing/DemoRequest';
import { LandingPage } from '@/landing/LandingPage';
import { readInitialChoice, SignupPage } from '@/signup/SignupPage';
import { beaconEvents, json, mockFetch, PLANS, text } from '@/test/fixtures';
import { renderEn, renderEs } from '@/test/render';

import { en, es, signupHref } from '.';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Forma de un diccionario: claves anidadas, largo de los arrays y dónde hay funciones. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}()`];
  if (Array.isArray(value)) {
    return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .flatMap((key) => shape((value as Record<string, unknown>)[key], `${path}.${key}`));
  }
  return [`${path}:${typeof value}`];
}

/** Todos los textos fijos de un diccionario, salvo los prefijos que pueden ir vacíos. */
const MAY_BE_EMPTY = new Set(['summaryBefore']);
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => (MAY_BE_EMPTY.has(key) ? [] : strings(v)));
  }
  return [];
}

describe('Diccionarios (TASK-012)', () => {
  it('es tiene exactamente las claves de en (paridad), con funciones donde en las tiene', () => {
    // `plans.names` es la excepción: en español vale el nombre de la API.
    const omit = (keys: string[]) => keys.filter((k) => !k.startsWith('.plans.names'));
    expect(omit(shape(es))).toEqual(omit(shape(en)));
  });

  it('las FAQ tienen las mismas preguntas en los dos idiomas', () => {
    const v = { days: 14, bonus: 50, minToRedeem: 100 };
    expect(es.faq.questions(v)).toHaveLength(en.faq.questions(v).length);
  });

  it('ningún texto vacío ni placeholder sin traducir', () => {
    for (const s of [...strings(en), ...strings(es)]) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(s).not.toMatch(/TODO|FIXME|lorem/i);
    }
  });

  it('el inglés mantiene las afirmaciones verificadas, sin agregar ninguna', () => {
    const v = { days: 14, bonus: 50, minToRedeem: 100 };
    const all = [...strings(en), ...en.faq.questions(v).flatMap((q) => [q.q, q.a])].join(' ');
    expect(all).toContain('there is no delivery or online payment within Ventea');
    expect(all).toContain('the customer pays at pickup');
    expect(all).toContain('0% commission per order');
    expect(all).toContain('each point is worth 1 cent');
    expect(all).toContain('from 100 points');
    expect(all).toContain('50 welcome points');
    expect(all).toContain('we load your menu with you');
    expect(all).toContain('14 days free, no card required');
    expect(all).toContain('we arrange the payment with you');
    expect(all).not.toMatch(/real[- ]time|home delivery|couriers|\d+\+? (restaurants|customers)/i);
  });
});

describe('Rutas e idioma (TASK-012)', () => {
  it('/ es la landing en inglés y /es/ en español, cada una con su h1', async () => {
    mockFetch(() => json(PLANS));
    const { unmount } = render(<App path="/" />);
    expect(text(screen.getByRole('heading', { level: 1 }))).toBe(
      'Your restaurant. Your own app. Your own customers.',
    );
    expect(document.documentElement.lang).toBe('en');
    await screen.findByTestId('price-pro');
    unmount();

    render(<App path="/es/" />);
    expect(text(screen.getByRole('heading', { level: 1 }))).toBe(
      'Su restaurante. Su propia app. Sus propios clientes.',
    );
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toBe('Ventea · App propia, pedidos y puntos para restaurantes');
    await screen.findByTestId('price-pro');
  });

  it('una ruta inexistente muestra la landing en inglés', async () => {
    mockFetch(() => json(PLANS));
    render(<App path="/no-existe" />);
    expect(text(screen.getByRole('heading', { level: 1 }))).toContain('Your restaurant.');
    await screen.findByTestId('price-pro');
  });

  it('el selector de idioma lleva a la vista equivalente', async () => {
    mockFetch(() => json(PLANS));
    const first = renderEn(<LandingPage />);
    await screen.findByTestId('price-pro');
    const toEs = screen.getAllByRole('link', { name: 'Español' });
    expect(toEs.length).toBeGreaterThan(0);
    for (const link of toEs) expect(link.getAttribute('href')).toBe('/es/');
    expect(toEs[0]!.getAttribute('hreflang')).toBe('es');
    first.unmount();

    renderEs(<LandingPage />);
    await screen.findByTestId('price-pro');
    for (const link of screen.getAllByRole('link', { name: 'English' })) {
      expect(link.getAttribute('href')).toBe('/');
    }
  });

  it('el prerender y el primer render del cliente coinciden (sin errores de hidratación)', async () => {
    for (const path of ['/', '/es/']) {
      mockFetch(() => json(PLANS));
      const html = renderToString(<App path={path} />);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      const onRecoverableError = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const root = await act(async () =>
        hydrateRoot(container, <App path={path} />, { onRecoverableError }),
      );
      await waitFor(() =>
        expect(container.querySelector('[data-testid="price-pro"]')).not.toBeNull(),
      );
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
      act(() => root.unmount());
      container.remove();
    }
  });
});

describe('Landing en inglés (TASK-012)', () => {
  it('precios en USD con nombres en inglés y links a /signup con plan e intervalo', async () => {
    mockFetch(() => json(PLANS));
    renderEn(<LandingPage />);

    expect(text(await screen.findByTestId('price-basic'))).toContain('$25 USD / month');
    const names = screen.getAllByRole('heading', { level: 3, name: /^(Basic|Pro|Chain)$/ });
    expect(names.map((h) => h.textContent)).toEqual(['Basic', 'Pro', 'Chain']);
    const pro = screen.getByRole('listitem', { name: 'Pro' });
    expect(within(pro).getByText('Recommended')).toBeTruthy();
    expect(within(pro).getByText('Branded app for Android and iOS')).toBeTruthy();
    expect(
      within(pro)
        .getByRole('link', { name: /Try Pro free/ })
        .getAttribute('href'),
    ).toBe('/signup?plan=pro&interval=monthly');

    fireEvent.click(screen.getByRole('radio', { name: /Annual/ }));
    expect(text(screen.getByTestId('price-pro'))).toContain('$590 USD / year');
    expect(within(pro).getByText(/Works out to \$49\.17 a month · save \$118/)).toBeTruthy();
    expect(
      within(pro)
        .getByRole('link', { name: /Try Pro free/ })
        .getAttribute('href'),
    ).toBe('/signup?plan=pro&interval=annual');
  });

  it('el demo es Casa Brasa con precios en lempiras; puntos con la configuración real', async () => {
    mockFetch(() => json(PLANS));
    const { container } = renderEn(<LandingPage />);
    await screen.findByTestId('price-pro');
    const all = text(container);
    expect(all).toContain('Casa Brasa');
    expect(all).toContain('House burger');
    expect(all).toContain('L 405.00');
    expect(all).toContain('Demo with a sample restaurant.');
    const loyalty = text(container.querySelector('#puntos'));
    expect(loyalty).toContain('1 point per lempira of the order');
    expect(loyalty).toContain('50 points when they create their account');
    expect(loyalty).toContain('From 100 points; each point is worth 1 cent');
    expect(container.querySelector('blockquote')).toBeNull();
  });

  it('las legales del pie llevan a la versión en español, con etiqueta clara', async () => {
    mockFetch(() => json(PLANS));
    renderEn(<LandingPage />);
    await screen.findByTestId('price-pro');
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    const terms = within(legal).getByRole('link', { name: 'Terms of Service (Spanish)' });
    const privacy = within(legal).getByRole('link', { name: 'Privacy Policy (Spanish)' });
    expect(terms.getAttribute('href')).toBe('/terminos');
    expect(privacy.getAttribute('href')).toBe('/privacidad');
    expect(terms.getAttribute('hreflang')).toBe('es');
  });

  it('los CTA en inglés van a /signup y cuentan en el embudo (mismo contrato)', async () => {
    mockFetch(() => json(PLANS));
    renderEn(<LandingPage />);
    await screen.findByTestId('price-pro');
    const cta = screen.getAllByRole('link', { name: /Sign up my restaurant/ })[0]!;
    expect(cta.getAttribute('href')).toBe('/signup');
    fireEvent.click(cta);
    expect(await beaconEvents()).toEqual(['visit', 'cta_click']);
  });

  it('el pedido de demo arma el mailto en inglés', () => {
    const navigate = vi.fn();
    renderEn(<DemoRequest navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request a demo' }));
    expect(screen.getByText('Please enter your name.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann' } });
    fireEvent.change(screen.getByLabelText('Restaurant name'), { target: { value: 'Grill 9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request a demo' }));
    const params = new URLSearchParams(String(navigate.mock.calls[0]![0]).split('?')[1]);
    expect(params.get('subject')).toBe('I’d like a Ventea demo: Grill 9');
    expect(params.get('body')).toContain('Restaurant: Grill 9');
    expect(
      buildDemoMailto({ name: 'A', restaurant: 'B', city: '', phone: '', message: '' }, 'es'),
    ).toContain(encodeURIComponent('Quiero una demo de Ventea: B'));
  });
});

describe('Registro en inglés (TASK-012)', () => {
  it('signupHref: ES conserva /registro?plan&intervalo; EN usa /signup?plan&interval', () => {
    expect(signupHref('es', 'pro', 'year')).toBe('/registro?plan=pro&intervalo=anual');
    expect(signupHref('en', 'pro', 'year')).toBe('/signup?plan=pro&interval=annual');
    expect(signupHref('en')).toBe('/signup');
  });

  it('readInitialChoice entiende los dos contratos', () => {
    expect(readInitialChoice('?plan=pro&intervalo=anual')).toEqual({
      plan: 'pro',
      interval: 'year',
    });
    expect(readInitialChoice('?plan=basic&interval=annual')).toEqual({
      plan: 'basic',
      interval: 'year',
    });
    expect(readInitialChoice('?plan=chain&interval=monthly')).toEqual({
      plan: 'chain',
      interval: 'month',
    });
  });

  it('/signup?plan=pro&intervalo=anual preselecciona Pro anual, en inglés', async () => {
    mockFetch(() => json(PLANS));
    renderEn(<SignupPage search="?plan=pro&intervalo=anual" />, '/signup');
    const pro = (await screen.findByRole('radio', { name: /Pro/ })) as HTMLInputElement;
    expect(pro.checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Annual/ }) as HTMLInputElement).checked).toBe(true);
    expect(text(pro.closest('label'))).toContain('$590 / year');
    expect(text(screen.getByRole('heading', { level: 1 }))).toBe('Step 1 of 3: Choose your plan');
    expect(screen.getByRole('radio', { name: /Basic/ })).toBeTruthy();
    // El cambio de idioma conserva la query.
    expect(screen.getByRole('link', { name: 'Español' }).getAttribute('href')).toBe(
      '/registro?plan=pro&intervalo=anual',
    );
  });

  it('el registro en inglés valida y muestra los errores de la API en inglés', async () => {
    mockFetch((url) => {
      if (url === '/api/platform/plans') return json(PLANS);
      if (url.startsWith('/api/platform/slug-available')) return json({ available: true });
      if (url === '/api/platform/signup') {
        return json({ statusCode: 400, message: '"grill-9" es un subdominio reservado' }, 400);
      }
      throw new Error(`URL inesperada ${url}`);
    });
    renderEn(<SignupPage search="" />, '/signup');
    await screen.findByRole('radio', { name: /Pro/ });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Restaurant name'), { target: { value: 'Grill 9' } });
    await screen.findByText('It’s available!', {}, { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: 'Create my restaurant' }));
    expect(screen.getByText('Enter your name.')).toBeTruthy();
    expect(screen.getByText(/Enter a valid email/)).toBeTruthy();
    expect(screen.getByText('Your password needs at least 10 characters.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ann Lee' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@mail.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-safe-password-1' } });
    const terms = screen.getByRole('link', { name: /Terms of Service \(Spanish\)/ });
    expect(terms.getAttribute('href')).toBe('/terminos');
    fireEvent.click(screen.getByRole('checkbox', { name: /I accept the Terms of Service/ }));
    expect(text(document.querySelector('.signup__summary'))).toBe(
      'Pro plan, monthly: $59 USD when the trial ends. You pay nothing today.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create my restaurant' }));

    const alert = await screen.findByRole('alert');
    expect(text(alert)).toBe('That address isn’t available. Choose another address.');
    expect(text(alert)).not.toMatch(/subdominio/);
    expect(screen.getByLabelText('Web address')).toBeTruthy();
  });
});
