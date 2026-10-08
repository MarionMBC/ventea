import type { StaffAuthResponse } from '@ventea/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { apiError, createFakeApi, json, STAFF_SESSION } from '@/test/fixtures';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 8, 15);

function overview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'manual',
    status: 'trialing',
    planCode: 'pro',
    planName: 'Pro',
    interval: 'month',
    price: { amountCents: 5900, currency: 'USD' },
    trialEndsAt: new Date(NOW + 14 * DAY).toISOString(),
    currentPeriodStart: new Date(NOW).toISOString(),
    currentPeriodEnd: new Date(NOW + 14 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    retryAt: null,
    pendingPlan: null,
    card: null,
    events: [
      {
        type: 'trial_started',
        description: 'Prueba gratis iniciada',
        amountCents: null,
        status: null,
        createdAt: new Date(NOW).toISOString(),
      },
      {
        type: 'payment_succeeded',
        description: 'Pago registrado',
        amountCents: 5900,
        status: 'succeeded',
        // Una API vieja todavía mandaría `message`: el panel no lo muestra.
        message: 'Pago manual (TRF-SECRETA) registrado por admin@ventea.tech',
        createdAt: new Date(NOW).toISOString(),
      },
    ],
    ...overrides,
  };
}

const PLANS = [
  {
    code: 'basic',
    name: 'Básico',
    priceMonthlyCents: 2500,
    priceYearlyCents: 25000,
    currency: 'USD',
    maxLocations: 1,
    features: { brandedApp: false, customDomain: false, reports: false, prioritySupport: false },
  },
  {
    code: 'pro',
    name: 'Pro',
    priceMonthlyCents: 5900,
    priceYearlyCents: 59000,
    currency: 'USD',
    maxLocations: 3,
    features: { brandedApp: true, customDomain: true, reports: false, prioritySupport: false },
  },
];

function renderBilling(
  options: {
    role?: StaffAuthResponse['staff']['role'];
    billing?: ReturnType<typeof overview>;
    path?: string;
  } = {},
) {
  const { role = 'owner', path = '/admin/facturacion' } = options;
  let state = options.billing ?? overview();
  const api = createFakeApi([]);
  api.setOverride((req) => {
    if (req.path === '/api/platform/plans') return json(PLANS);
    if (req.path === '/api/billing' && req.method === 'GET') return json(state);
    if (req.path === '/api/billing/cancel') {
      state = { ...state, cancelAtPeriodEnd: true };
      return json(state);
    }
    if (req.path === '/api/billing/resume') {
      state = { ...state, cancelAtPeriodEnd: false };
      return json(state);
    }
    if (req.path === '/api/billing/change-plan') {
      const body = req.body as { planCode: string; interval: string };
      state = {
        ...state,
        pendingPlan: {
          planCode: body.planCode,
          interval: body.interval,
          price: { amountCents: 2500, currency: 'USD' },
        },
      };
      return json(state);
    }
    return undefined;
  });
  const session = createSessionStore(null);
  session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', path);
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api };
}

afterEach(() => {
  document.title = '';
});

describe('Facturación del dueño', () => {
  it('el dueño ve la sección: plan, estado, prueba, tarjeta y movimientos', async () => {
    renderBilling();
    expect(await screen.findByRole('heading', { level: 1, name: 'Facturación' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Facturación' })).toBeTruthy();
    expect(screen.getByText('Pro mensual')).toBeTruthy();
    expect(screen.getByText('$59.00 USD / mes')).toBeTruthy();
    expect(screen.getAllByText('En prueba').length).toBeGreaterThan(0);
    expect(screen.getByText('Prueba gratis hasta')).toBeTruthy();
    expect(screen.getByText('Sin tarjeta')).toBeTruthy();
    expect(screen.getByText('Prueba gratis iniciada')).toBeTruthy();
    expect(screen.getByText('Pago registrado')).toBeTruthy();
    expect(document.body.textContent).not.toContain('TRF-SECRETA');
    expect(document.body.textContent).not.toContain('admin@ventea.tech');
    const note = screen.getByText(/El pago se coordina con el equipo de Ventea/);
    expect(note.querySelector('a')?.getAttribute('href')).toBe('mailto:hola@ventea.tech');
    expect(screen.queryByText(/Pronto vas a poder registrar tu tarjeta/)).toBeNull();
  });

  it('con cobro por tarjeta (no manual) avisa que el alta en el panel llega después', async () => {
    renderBilling({
      billing: overview({
        mode: 'ms-payments',
        card: { brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030 },
      }),
    });
    expect(await screen.findByText('visa ••••4242')).toBeTruthy();
    expect(screen.getByText(/Pronto vas a poder registrar tu tarjeta/)).toBeTruthy();
    expect(screen.getByText(/El pago se coordina con el equipo de Ventea/)).toBeTruthy();
  });

  it.each(['manager', 'staff'] as const)('%s no ve la sección ni puede entrar', async (role) => {
    const { api } = renderBilling({ role });
    await waitFor(() => expect(window.location.pathname).toBe('/admin/orders'));
    expect(screen.queryByRole('link', { name: 'Facturación' })).toBeNull();
    expect(api.calls.some((c) => c.path === '/api/billing')).toBe(false);
  });

  it('marca suspendida: aviso arriba y la página funciona', async () => {
    renderBilling({ billing: overview({ status: 'suspended', trialEndsAt: null }) });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Tu servicio está suspendido');
    expect(screen.getByText('Pro mensual')).toBeTruthy();
  });

  it('cancelar y reanudar, con confirmación', async () => {
    const { api } = renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar suscripción' }));
    const dialog = screen.getByRole('dialog', { name: '¿Cancelar tu suscripción?' });
    expect(dialog.textContent).toContain('sigue funcionando hasta el');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }));

    expect((await screen.findByRole('status')).textContent).toContain('tu servicio sigue hasta');
    expect(screen.getByText(/Se cancela el/)).toBeTruthy();
    expect(api.count('POST', '/api/billing/cancel')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reanudar suscripción' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reanudar' }));
    expect((await screen.findByRole('status')).textContent).toBe('Suscripción reanudada.');
    expect(screen.getByText('Automática')).toBeTruthy();
  });

  it('cambiar plan agenda el cambio para el próximo período', async () => {
    const { api } = renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Cambiar plan' });
    await within(dialog).findByRole('option', { name: 'Básico' });
    fireEvent.change(within(dialog).getByLabelText('Plan'), { target: { value: 'basic' } });
    expect(dialog.textContent).toContain('$25.00 USD / mes');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agendar cambio' }));

    expect((await screen.findByRole('status')).textContent).toContain('Cambio de plan agendado');
    expect(screen.getByText(/Básico mensual desde el/)).toBeTruthy();
    expect(api.calls.find((c) => c.path === '/api/billing/change-plan')?.body).toEqual({
      planCode: 'basic',
      interval: 'month',
    });
  });

  it('cambiar plan con 409 muestra el mensaje en el diálogo', async () => {
    const { api } = renderBilling();
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar plan' }));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Básico' });
    api.setOverride((req) => {
      if (req.path === '/api/platform/plans') return json(PLANS);
      if (req.path === '/api/billing/change-plan')
        return apiError(409, 'Tienes 2 sucursales activas y el plan Básico permite 1');
      return undefined;
    });
    fireEvent.change(within(dialog).getByLabelText('Plan'), { target: { value: 'basic' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agendar cambio' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'plan Básico permite 1',
    );
  });

  it('un movimiento de tipo nuevo se muestra con la descripción del servidor', async () => {
    renderBilling({
      billing: overview({
        events: [
          {
            type: 'refund_issued',
            description: 'Reembolso',
            amountCents: 500,
            status: null,
            createdAt: new Date(NOW).toISOString(),
          },
        ],
      }),
    });
    expect(await screen.findByText('Reembolso')).toBeTruthy();
  });
});
