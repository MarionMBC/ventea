import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TERMS_VERSION } from '@/config';
import { beaconEvents, callsTo, json, mockFetch, PLANS, text } from '@/test/fixtures';

import { READY_MESSAGE, readInitialChoice, SignupPage } from './SignupPage';

afterEach(() => {
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

type SignupReply = () => Response;

/**
 * API falsa: planes, slug libre salvo `taken`, el registro responde `reply` y la dirección
 * está lista según `ready()` (por defecto, sí).
 */
function api(
  reply: SignupReply = () => json(SIGNUP_OK, 201),
  taken: string[] = [],
  ready: () => boolean = () => true,
) {
  return mockFetch((url) => {
    if (url.startsWith('/api/platform/tenant-ready')) return json({ ready: ready() });
    if (url === '/api/platform/plans') return json(PLANS);
    if (url.startsWith('/api/platform/slug-available')) {
      const slug = new URL(url, 'http://x').searchParams.get('slug') ?? '';
      return json(
        taken.includes(slug) ? { available: false, reason: 'taken' } : { available: true },
      );
    }
    if (url === '/api/platform/signup') return reply();
    throw new Error(`URL inesperada ${url}`);
  });
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

async function fillRestaurant(name = 'Pollos Doña Ana') {
  await screen.findByRole('radio', { name: /Pro/ });
  next();
  fireEvent.change(screen.getByLabelText('Nombre del restaurante'), { target: { value: name } });
  await screen.findByText('¡Está libre!', {}, { timeout: 2000 });
  next();
}

function fillOwner() {
  fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana López' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@correo.com' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'una-clave-segura-1' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /Acepto los términos/ }));
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Crear mi restaurante' }));

describe('readInitialChoice', () => {
  it('lee plan e intervalo de la URL; por defecto Pro mensual', () => {
    expect(readInitialChoice('?plan=chain&intervalo=anual')).toEqual({
      plan: 'chain',
      interval: 'year',
    });
    expect(readInitialChoice('')).toEqual({ plan: 'pro', interval: 'month' });
  });
});

describe('Registro (AC2)', () => {
  it('preselecciona el plan y el intervalo que vienen de precios', async () => {
    api();
    render(<SignupPage search="?plan=basic&intervalo=anual" />);

    const basic = (await screen.findByRole('radio', { name: /Básico/ })) as HTMLInputElement;
    expect(basic.checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Anual/ }) as HTMLInputElement).checked).toBe(true);
    expect(text(basic.closest('label'))).toContain('$250 / año');
  });

  it('genera el slug desde el nombre, lo consulta en vivo y muestra el preview', async () => {
    const fetchMock = api(undefined, ['pollos-juan']);
    render(<SignupPage search="" />);
    await screen.findByRole('radio', { name: /Pro/ });
    next();

    fireEvent.change(screen.getByLabelText('Nombre del restaurante'), {
      target: { value: 'Pollos Doña Ana' },
    });
    const slug = screen.getByLabelText('Dirección web') as HTMLInputElement;
    expect(slug.value).toBe('pollos-dona-ana');
    expect(text(document.querySelector('.slug__preview'))).toBe('pollos-dona-ana.ventea.tech');
    expect(await screen.findByText('¡Está libre!', {}, { timeout: 2000 })).toBeTruthy();

    // Debounce: tres cambios seguidos = una sola consulta, con el último valor.
    const before = callsTo(fetchMock, '/platform/slug-available').length;
    fireEvent.change(slug, { target: { value: 'pollos-j' } });
    fireEvent.change(slug, { target: { value: 'pollos-ju' } });
    fireEvent.change(slug, { target: { value: 'pollos-juan' } });
    expect(text(document.getElementById('slug-status'))).toBe('Revisando si está libre…');
    await screen.findByText(/ya la usa otro restaurante/, {}, { timeout: 2000 });
    const after = callsTo(fetchMock, '/platform/slug-available').slice(before);
    expect(after.map(([url]) => String(url))).toEqual([
      '/api/platform/slug-available?slug=pollos-juan',
    ]);

    // Tomado: no deja avanzar.
    next();
    expect(screen.getByLabelText('Dirección web')).toBeTruthy();

    // Formato inválido: ni consulta.
    fireEvent.change(slug, { target: { value: 'ab' } });
    expect(text(document.getElementById('slug-status'))).toMatch(/de 3 a 63/);
  });

  it('flujo completo: crea la marca y muestra el link al panel y el aviso de 1-2 minutos', async () => {
    const fetchMock = api();
    render(<SignupPage search="?plan=pro&intervalo=anual" />);
    await fillRestaurant();
    fillOwner();
    expect(text(document.querySelector('.signup__summary'))).toContain('Plan Pro anual: $590 USD');
    submit();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Entrar a mi panel' }).getAttribute('href')).toBe(
        'https://pollos-dona-ana.ventea.tech/admin',
      ),
    );
    expect(text(screen.getByRole('status'))).toBe(READY_MESSAGE.ready);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Pollos Doña Ana ya está en Ventea',
    );

    const [, init] = callsTo(fetchMock, '/platform/signup')[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      restaurantName: 'Pollos Doña Ana',
      slug: 'pollos-dona-ana',
      ownerName: 'Ana López',
      ownerEmail: 'ana@correo.com',
      ownerPassword: 'una-clave-segura-1',
      planCode: 'pro',
      interval: 'year',
      website: '',
      acceptedTermsVersion: TERMS_VERSION,
    });
    // Embudo: un evento por paso y ningún dato del formulario. El registro completo lo cuenta
    // la API al crear la marca, no el navegador.
    expect(await beaconEvents()).toEqual(['signup_start', 'signup_step_2', 'signup_step_3']);
  });

  it('valida los datos del dueño antes de enviar (contraseña de 10+)', async () => {
    const fetchMock = api();
    render(<SignupPage search="" />);
    await fillRestaurant();
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'corta' } });
    expect(text(document.querySelector('.field__hint[aria-live]'))).toBe('Faltan 5 caracteres.');
    submit();

    expect(screen.getByText('Escribe tu nombre.')).toBeTruthy();
    expect(screen.getByText(/Escribe un correo válido/)).toBeTruthy();
    expect(screen.getByText('La contraseña necesita al menos 10 caracteres.')).toBeTruthy();
    expect(callsTo(fetchMock, '/platform/signup')).toHaveLength(0);
  });

  it('honeypot `website` oculto: fuera del tab y de los lectores', async () => {
    api();
    render(<SignupPage search="" />);
    await fillRestaurant();
    const honeypot = document.getElementById('hp-ref') as HTMLInputElement;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.autocomplete).toBe('off');
    expect(honeypot.name).not.toMatch(/website|url|company|email|name/i);
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'No completar' })).toBeNull();
  });

  it('409: vuelve al paso de la dirección y la marca tomada', async () => {
    api(() => json({ statusCode: 409, message: 'Ese subdominio ya está en uso' }, 409));
    render(<SignupPage search="" />);
    await fillRestaurant();
    fillOwner();
    submit();

    expect(text(await screen.findByRole('alert'))).toContain(
      'Esa dirección ya la tomó otro restaurante',
    );
    expect(screen.getByLabelText('Dirección web')).toBeTruthy();
    expect(text(document.getElementById('slug-status'))).toContain('ya la usa otro restaurante');
  });

  it('400 reservado: vuelve a la dirección con el mensaje de la API', async () => {
    api(() =>
      json({ statusCode: 400, message: '"pollos-dona-ana" es un subdominio reservado' }, 400),
    );
    render(<SignupPage search="" />);
    await fillRestaurant();
    fillOwner();
    submit();

    expect(text(await screen.findByRole('alert'))).toContain(
      '"pollos-dona-ana" es un subdominio reservado. Elige otra dirección.',
    );
    expect(screen.getByLabelText('Dirección web')).toBeTruthy();
  });

  it('400 de validación de otro campo: se queda en el paso del dueño', async () => {
    api(() =>
      json({ message: 'Datos inválidos', issues: [{ path: 'ownerEmail', message: 'email' }] }, 400),
    );
    render(<SignupPage search="" />);
    await fillRestaurant();
    fillOwner();
    submit();

    expect(text(await screen.findByRole('alert'))).toContain('Revisa tus datos');
    expect(screen.getByLabelText('Correo')).toBeTruthy();
  });

  it('429: registro temporalmente cerrado, con el contacto', async () => {
    api(() =>
      json({ statusCode: 429, message: 'Registro temporalmente cerrado, escríbenos' }, 429),
    );
    render(<SignupPage search="" />);
    await fillRestaurant();
    fillOwner();
    submit();

    const alert = await screen.findByRole('alert');
    expect(text(alert)).toContain('Registro temporalmente cerrado, escríbenos.');
    expect(alert.querySelector('a')?.getAttribute('href')).toBe('mailto:hola@ventea.tech');
  });

  it('409 tras un envío cortado: avisa que quizá ya se creó, con el link al panel', async () => {
    let calls = 0;
    api(() => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch'); // el server creó, la respuesta se perdió
      return json({ statusCode: 409, message: 'Ese subdominio ya está en uso' }, 409);
    });
    render(<SignupPage search="" />);
    await fillRestaurant();
    fillOwner();
    submit();
    expect(text(await screen.findByRole('alert'))).toContain('No pudimos conectar');

    submit();
    await waitFor(() =>
      expect(text(screen.getByRole('alert'))).toContain(
        'Puede que tu restaurante ya se haya creado',
      ),
    );
    expect(text(screen.getByRole('alert'))).not.toContain('otro restaurante');
    const link = screen.getByRole('link', { name: 'https://pollos-dona-ana.ventea.tech/admin' });
    expect(link.getAttribute('href')).toBe('https://pollos-dona-ana.ventea.tech/admin');
    expect(screen.getByLabelText('Correo')).toBeTruthy(); // se queda en el paso 3
  });

  it('sin red: avisa y deja reintentar sin perder los datos', async () => {
    let offline = true;
    api(() => {
      if (offline) throw new TypeError('Failed to fetch');
      return json(SIGNUP_OK, 201);
    });
    render(<SignupPage search="" />);
    await fillRestaurant();
    fillOwner();
    submit();

    expect(text(await screen.findByRole('alert'))).toContain('No pudimos conectar con Ventea');
    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('ana@correo.com');

    offline = false;
    submit();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Entrar a mi panel' })).toBeTruthy(),
    );
  });
});
