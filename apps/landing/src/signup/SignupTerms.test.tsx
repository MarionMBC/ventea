import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TERMS_VERSIONS } from '@ventea/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TERMS_VERSION } from '@/config';
import { callsTo, json, mockFetch, PLANS, text } from '@/test/fixtures';

import { READY_MESSAGE, SignupPage, TERMS_ERROR } from './SignupPage';
import { READY_POLL_MS, READY_SLOW_MS } from './useTenantReady';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SIGNUP_OK = {
  tenant: {
    slug: 'pollos-dona-ana',
    url: 'https://pollos-dona-ana.ventea.tech',
    adminUrl: 'https://pollos-dona-ana.ventea.tech/admin',
    region: 'hn-1',
  },
  trialEndsAt: '2026-10-22T12:00:00.000Z',
};

/** API falsa; `tenantReady` decide la respuesta de `GET /platform/tenant-ready`. */
function api(tenantReady: () => Response = () => json({ ready: true })) {
  return mockFetch((url) => {
    if (url === '/api/platform/plans') return json(PLANS);
    if (url.startsWith('/api/platform/slug-available')) return json({ available: true });
    if (url === '/api/platform/signup') return json(SIGNUP_OK, 201);
    if (url.startsWith('/api/platform/tenant-ready')) return tenantReady();
    throw new Error(`URL inesperada ${url}`);
  });
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Crear mi restaurante' }));
const panelLink = () => screen.getByRole('link', { name: 'Entrar a mi panel' });

async function toOwnerStep() {
  render(<SignupPage search="" />);
  await screen.findByRole('radio', { name: /Pro/ });
  next();
  fireEvent.change(screen.getByLabelText('Nombre del restaurante'), {
    target: { value: 'Pollos Doña Ana' },
  });
  await screen.findByText('¡Está libre!', {}, { timeout: 2000 });
  next();
  fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana López' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@correo.com' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'una-clave-segura-1' },
  });
}

/**
 * Avanza de a un ciclo de polling hasta que `check` pase: la respuesta del fetch falso tarda
 * unos milisegundos reales en procesarse, así que un solo salto de reloj puede no alcanzar.
 */
async function pollUntil(check: () => void, cycles = 5) {
  for (let i = 0; i < cycles; i++) {
    await vi.advanceTimersByTimeAsync(READY_POLL_MS);
    try {
      await waitFor(check, { timeout: 300 });
      return;
    } catch {
      // Otro ciclo.
    }
  }
  check();
}

async function signUp() {
  // Relojes falsos que igual avanzan solos: los debounce y findBy funcionan, y el test puede
  // saltar los 5 s del polling o los 4 min del aviso.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await toOwnerStep();
  fireEvent.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
  submit();
  await screen.findByRole('heading', { level: 1, name: /ya está en Ventea/ });
}

describe('Términos y privacidad en el registro (TASK-007 AC1)', () => {
  it('la versión que manda la landing es la vigente en la API', () => {
    expect(TERMS_VERSION).toBe(TERMS_VERSIONS[TERMS_VERSIONS.length - 1]);
  });

  it('sin aceptar no se envía; los links llevan a términos y privacidad', async () => {
    const fetchMock = api();
    await toOwnerStep();

    expect(screen.getByRole('link', { name: /Términos del servicio/ }).getAttribute('href')).toBe(
      '/terminos',
    );
    expect(screen.getByRole('link', { name: /Política de privacidad/ }).getAttribute('href')).toBe(
      '/privacidad',
    );

    submit();
    expect(screen.getByText(TERMS_ERROR)).toBeTruthy();
    const checkbox = screen.getByRole('checkbox', { name: /Acepto los términos/ });
    expect(checkbox.getAttribute('aria-invalid')).toBe('true');
    expect(callsTo(fetchMock, '/platform/signup')).toHaveLength(0);

    fireEvent.click(checkbox);
    submit();
    await screen.findByRole('heading', { level: 1, name: /ya está en Ventea/ });
    const [, init] = callsTo(fetchMock, '/platform/signup')[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).acceptedTermsVersion).toBe(TERMS_VERSION);
  });
});

describe('Dirección lista antes de entrar al panel (bug de certificado, TASK-007)', () => {
  it('link deshabilitado mientras no hay certificado; se habilita al estar lista (polling 5 s)', async () => {
    let ready = false;
    const fetchMock = api(() => json({ ready }));
    await signUp();

    expect(panelLink().getAttribute('aria-disabled')).toBe('true');
    expect(panelLink().hasAttribute('href')).toBe(false);
    expect(text(screen.getByRole('status'))).toBe(READY_MESSAGE.checking);
    expect(READY_MESSAGE.checking).toBe(
      'Preparando tu dirección segura… (puede tardar hasta 2 minutos)',
    );
    // La página de pedidos tampoco se enlaza todavía.
    expect(screen.queryByRole('link', { name: 'pollos-dona-ana.ventea.tech' })).toBeNull();
    await waitFor(() => expect(callsTo(fetchMock, '/platform/tenant-ready')).toHaveLength(1));
    expect(String(callsTo(fetchMock, '/platform/tenant-ready')[0]![0])).toBe(
      '/api/platform/tenant-ready?slug=pollos-dona-ana',
    );

    await pollUntil(() =>
      expect(callsTo(fetchMock, '/platform/tenant-ready').length).toBeGreaterThanOrEqual(2),
    );
    expect(panelLink().hasAttribute('href')).toBe(false);

    ready = true;
    await pollUntil(() =>
      expect(panelLink().getAttribute('href')).toBe('https://pollos-dona-ana.ventea.tech/admin'),
    );
    expect(panelLink().hasAttribute('aria-disabled')).toBe(false);
    // role=status es una región aria-live: el cambio se anuncia.
    expect(text(screen.getByRole('status'))).toBe(READY_MESSAGE.ready);
    expect(
      screen.getByRole('link', { name: 'pollos-dona-ana.ventea.tech' }).getAttribute('href'),
    ).toBe('https://pollos-dona-ana.ventea.tech');

    // Lista: deja de preguntar.
    const calls = callsTo(fetchMock, '/platform/tenant-ready').length;
    await vi.advanceTimersByTimeAsync(READY_POLL_MS * 3);
    expect(callsTo(fetchMock, '/platform/tenant-ready')).toHaveLength(calls);
  });

  it('a los 4 minutos sin certificado avisa que tarda y deja el link visible', async () => {
    api(() => json({ ready: false }));
    await signUp();

    await vi.advanceTimersByTimeAsync(READY_SLOW_MS);

    const status = screen.getByRole('status');
    expect(text(status)).toContain('Está tardando más de lo normal');
    expect(status.querySelector('a')?.getAttribute('href')).toBe('mailto:hola@ventea.tech');
    expect(panelLink().getAttribute('href')).toBe('https://pollos-dona-ana.ventea.tech/admin');
  });

  it('un error de la consulta (429, red) cuenta como «todavía no» y se reintenta', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      return calls === 1 ? json({ statusCode: 429 }, 429) : json({ ready: true });
    });
    await signUp();
    expect(panelLink().hasAttribute('href')).toBe(false);

    await pollUntil(() =>
      expect(panelLink().getAttribute('href')).toBe('https://pollos-dona-ana.ventea.tech/admin'),
    );
  });
});
