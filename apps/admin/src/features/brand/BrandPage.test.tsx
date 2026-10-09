import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { textContrastOn, type Brand } from '@ventea/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { createFakeApi, json, STAFF_SESSION } from '@/test/fixtures';
import { makeMenu, menuHandler } from '@/test/menu-fixtures';

import { brandPatch } from './BrandPage';
import { contrastWarning } from './ColorField';

function warningsOf(brand: Pick<Brand, 'primaryColor' | 'secondaryColor' | 'accentColor'>) {
  return (['primaryColor', 'secondaryColor', 'accentColor'] as const).flatMap((field) => {
    const color = brand[field];
    if (!color) return [];
    const { white, black } = textContrastOn(color);
    return white >= 4.5
      ? []
      : [
          {
            field,
            message: 'Contraste bajo',
            whiteRatio: white,
            blackRatio: black,
            recommendedTextColor: black > white ? ('black' as const) : ('white' as const),
          },
        ];
  });
}

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  const base: Brand = {
    appDisplayName: 'Carolina Hot Chicken',
    primaryColor: '#e23b2e',
    secondaryColor: '#1f1d1b',
    accentColor: null,
    logoUrl: null,
    iconUrl: null,
    storeShortDescription: null,
    supportEmail: null,
    websiteUrl: null,
    language: 'es',
    warnings: [],
    app: {
      status: 'not_requested',
      publisher: null,
      bundleId: null,
      version: null,
      storeUrls: { android: null, ios: null },
      requestedAt: null,
      brandedAppAvailable: true,
    },
    ...overrides,
  };
  return { ...base, warnings: warningsOf(base) };
}

function renderBrand({
  role = 'owner',
  brand = makeBrand(),
}: { role?: 'owner' | 'manager' | 'staff'; brand?: Brand } = {}) {
  const state = { brand, menu: makeMenu() };
  const api = createFakeApi();
  const menu = menuHandler(state);
  api.setOverride((req) => {
    if (req.path === '/api/staff/brand' && req.method === 'GET') return json(state.brand);
    if (req.path === '/api/staff/brand' && req.method === 'PATCH') {
      const next = { ...state.brand, ...(req.body as Partial<Brand>) };
      state.brand = { ...next, warnings: warningsOf(next) };
      return json(state.brand);
    }
    if (req.path === '/api/staff/brand/app-request') {
      if (!state.brand.app.brandedAppAvailable) {
        return json(
          {
            statusCode: 403,
            message: 'Tu plan Básico no incluye app propia: está en los planes Pro y Cadena',
            error: 'Forbidden',
            code: 'plan_limit',
            limit: { resource: 'branded_app', plan: 'basic', planName: 'Básico', max: null },
          },
          403,
        );
      }
      state.brand = {
        ...state.brand,
        app: {
          ...state.brand.app,
          status: 'requested',
          publisher: 'ventea',
          bundleId: 'app.ventea.carolinahotchicken',
          requestedAt: new Date('2026-10-09T12:00:00Z'),
        },
      };
      return json(state.brand, 201);
    }
    return menu(req);
  });
  const session = createSessionStore(null);
  session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', '/admin/brand');
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, state };
}

afterEach(() => {
  document.title = '';
});

describe('Mi marca', () => {
  it('solo el dueño: el resto vuelve a pedidos', async () => {
    renderBrand({ role: 'manager' });
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'My brand' })).toBeNull();
  });

  it('muestra la marca, la advertencia AA de la API y la vista previa con el menú real', async () => {
    renderBrand();
    expect(await screen.findByRole('heading', { level: 1, name: 'My brand' })).toBeTruthy();
    expect((screen.getByLabelText('App name') as HTMLInputElement).value).toBe(
      'Carolina Hot Chicken',
    );
    // #e23b2e: el blanco no llega a 4.5:1, el negro sí → la API lo advierte.
    expect(screen.getByText(/White text is hard to read on this color \(4\.\d:1\)/)).toBeTruthy();
    expect(screen.getByText('White text reads well on this color.')).toBeTruthy();
    const preview = screen.getByRole('img', { name: /Preview of the Carolina Hot Chicken app/ });
    expect(preview).toBeTruthy();
    await waitFor(() => expect(preview.textContent).toContain('Reaper Sandwich'));
    expect(preview.textContent).toContain('$12.90');
  });

  it('cambiar el color: vista previa en vivo, advertencia en vivo y PATCH solo del color', async () => {
    const { api, state } = renderBrand();
    await screen.findByLabelText('Primary color');
    const hex = screen.getByLabelText('Primary color') as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#1d4ed8' } });
    expect(screen.getAllByText('White text reads well on this color.').length).toBe(2);
    const figure = screen.getByRole('img', { name: /Preview/ }).closest('figure')!;
    expect(figure.style.getPropertyValue('--pv-primary')).toBe('#1d4ed8');
    expect(figure.style.getPropertyValue('--pv-on-primary')).toBe('#ffffff');
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();

    // Color claro: advierte en vivo, sin guardar.
    fireEvent.change(hex, { target: { value: 'ffd400' } });
    expect(screen.getByText(/Black text reads better/)).toBeTruthy();
    expect(figure.style.getPropertyValue('--pv-on-primary')).toBe('#111111');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Brand saved. Your app and online menu now use it.'),
    ).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ primaryColor: '#ffd400' });
    expect(state.brand.primaryColor).toBe('#ffd400');
    // El shell vuelve a pedir la marca pública (colores del panel).
    await waitFor(() => expect(api.count('GET', '/api/tenant')).toBeGreaterThan(1));
  });

  it('un hex incompleto se marca y no cambia el color', async () => {
    renderBrand();
    const hex = (await screen.findByLabelText('Secondary color')) as HTMLInputElement;
    fireEvent.change(hex, { target: { value: '#12' } });
    expect(screen.getByText('Use a hex color like #e23b2e.')).toBeTruthy();
    expect(screen.getByText('All changes saved.')).toBeTruthy();
  });

  it('validación de correo y sitio; descartar vuelve a lo guardado', async () => {
    const { api } = renderBrand();
    const email = (await screen.findByLabelText(/Support email/)) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'no-es-correo' } });
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: 'http://x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a valid email.')).toBeTruthy();
    expect(screen.getByText('Use a full address that starts with https://.')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(email.value).toBe('');
  });

  it('Pro/Cadena: solicitar la app la deja en «Requested»', async () => {
    const { api } = renderBrand();
    const card = (await screen.findByRole('heading', { name: 'Your own app' })).closest('article')!;
    expect(within(card).getByText('Not requested')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Request my app' }));
    expect(await screen.findByText('App requested. We’ll contact you to publish it.')).toBeTruthy();
    expect(within(card).getAllByText('Requested').length).toBeGreaterThan(0);
    expect(within(card).getByText('Ventea')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Request my app' })).toBeNull();
    expect(api.count('POST', '/api/staff/brand/app-request')).toBe(1);
  });

  it('Básico: CTA para subir de plan, sin botón de solicitar', async () => {
    const brand = makeBrand();
    renderBrand({ brand: { ...brand, app: { ...brand.app, brandedAppAvailable: false } } });
    const card = (await screen.findByRole('heading', { name: 'Your own app' })).closest('article')!;
    expect(within(card).getByText(/included in the Pro and Chain plans/)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'See plans' }).getAttribute('href')).toBe(
      '/admin/facturacion',
    );
    expect(within(card).queryByRole('button', { name: 'Request my app' })).toBeNull();
  });

  it('publicada: links de tienda', async () => {
    const brand = makeBrand();
    renderBrand({
      brand: {
        ...brand,
        app: {
          ...brand.app,
          status: 'published',
          publisher: 'client',
          version: '1.2.0',
          storeUrls: { android: 'https://play.google.com/store/apps/details?id=x', ios: null },
        },
      },
    });
    expect(await screen.findByRole('link', { name: 'Google Play' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'App Store' })).toBeNull();
    expect(screen.getByText('Your developer account')).toBeTruthy();
    expect(screen.getByText('1.2.0')).toBeTruthy();
  });
});

describe('reglas de Mi marca', () => {
  const saved = {
    appDisplayName: 'A',
    primaryColor: '#e23b2e',
    secondaryColor: '#111111',
    accentColor: null,
    logoUrl: '/api/media/t/a.webp',
    iconUrl: null,
    storeShortDescription: '',
    supportEmail: '',
    websiteUrl: '',
    language: 'es' as const,
  };

  it('el PATCH lleva solo lo cambiado; vacío → null', () => {
    expect(brandPatch(saved, saved)).toEqual({});
    expect(
      brandPatch(saved, {
        ...saved,
        appDisplayName: ' B ',
        supportEmail: ' a@b.co ',
        logoUrl: null,
      }),
    ).toEqual({ appDisplayName: 'B', supportEmail: 'a@b.co', logoUrl: null });
    expect(
      brandPatch({ ...saved, websiteUrl: 'https://x.co' }, { ...saved, websiteUrl: '  ' }),
    ).toEqual({ websiteUrl: null });
  });

  it('advertencia: la de la API para el color guardado; calculada para uno nuevo', () => {
    const api = {
      field: 'primaryColor' as const,
      message: 'x',
      whiteRatio: 1,
      blackRatio: 2,
      recommendedTextColor: 'black' as const,
    };
    expect(contrastWarning('primaryColor', '#E23B2E', { color: '#e23b2e', warnings: [api] })).toBe(
      api,
    );
    expect(contrastWarning('primaryColor', '#000000', { color: '#e23b2e', warnings: [api] })).toBe(
      null,
    );
    expect(
      contrastWarning('primaryColor', '#ffff00', { color: '#e23b2e', warnings: [] }),
    ).toMatchObject({ recommendedTextColor: 'black' });
  });
});
