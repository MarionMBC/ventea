import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SalesReport } from '@ventea/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { createFakeApi, json, STAFF_SESSION } from '@/test/fixtures';

import { labelEvery, niceMax } from './charts';
import { CSV_ES, toCsv } from './csv';
import { shiftDay, todayIn } from './ReportsPage';

const LOCATION = '00000000-0000-4000-8000-00000000b001';

function makeReport(overrides: Partial<SalesReport> = {}): SalesReport {
  return {
    timezone: 'America/Tegucigalpa',
    currency: 'USD',
    from: '2026-03-01',
    to: '2026-03-03',
    granularity: 'day',
    locationId: null,
    locations: [{ id: LOCATION, name: 'Centro', isActive: true }],
    totals: {
      orders: 3,
      salesCents: 1800,
      averageTicketCents: 600,
      discountCents: 100,
      cancelledOrders: 1,
    },
    series: [
      { period: '2026-03-01', orders: 0, salesCents: 0 },
      { period: '2026-03-02', orders: 2, salesCents: 1500 },
      { period: '2026-03-03', orders: 1, salesCents: 300 },
    ],
    byStatus: [
      { status: 'completed', orders: 3 },
      { status: 'cancelled', orders: 1 },
    ],
    topProducts: [{ menuItemId: null, name: '=Burger', quantity: 3, salesCents: 1400 }],
    peakHours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: hour === 12 ? 2 : hour === 18 ? 1 : 0,
      salesCents: hour === 12 ? 1500 : hour === 18 ? 300 : 0,
    })),
    ...overrides,
  };
}

function renderReports({
  role = 'owner',
  respond,
  path = '/admin/reports',
}: {
  path?: string;
  role?: 'owner' | 'manager' | 'staff';
  respond?: (query: URLSearchParams) => Response;
} = {}) {
  const api = createFakeApi();
  api.setOverride((req) => {
    if (req.path === '/api/staff/reports/sales') {
      if (respond) return respond(req.query);
      const granularity = (req.query.get('granularity') ?? 'day') as SalesReport['granularity'];
      return json(makeReport({ granularity }));
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

describe('helpers de reportes', () => {
  it('CSV con comillas, BOM y fórmulas neutralizadas', () => {
    expect(
      toCsv([
        ['Producto', 'Ventas'],
        ['=HYPERLINK("x")', 14],
        ['Combo, grande', -2],
        ['@SUM', '+1'],
      ]),
    ).toBe('﻿Producto,Ventas\r\n"\'=HYPERLINK(""x"")",14\r\n"Combo, grande",-2\r\n\'@SUM,\'+1\r\n');
  });

  it('CSV en español: punto y coma y coma decimal (Excel en configuración hispana)', () => {
    expect(
      toCsv(
        [
          ['Período', 'Ventas'],
          ['Combo; grande', 1049.3],
          ['Semana', 12],
        ],
        CSV_ES,
      ),
    ).toBe('﻿Período;Ventas\r\n"Combo; grande";1049,3\r\nSemana;12\r\n');
  });

  it('eje en números redondos y etiquetas espaciadas', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1500)).toBe(2000);
    expect(niceMax(2000)).toBe(2000);
    expect(niceMax(7)).toBe(10);
    expect(labelEvery(7)).toBe(1);
    expect(labelEvery(30)).toBe(4);
  });

  it('hoy en la zona de la marca', () => {
    const now = new Date('2026-10-09T03:30:00Z');
    expect(todayIn('America/Tegucigalpa', now)).toBe('2026-10-08');
    expect(todayIn('UTC', now)).toBe('2026-10-09');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('Reportes', () => {
  it('el staff vuelve a pedidos; el gerente entra', async () => {
    renderReports({ role: 'staff' });
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Reports' })).toBeNull();
  });

  it('KPIs, gráfico con resumen accesible y su tabla alternativa', async () => {
    renderReports({ role: 'manager' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    const kpis = screen.getByRole('heading', { name: 'Summary of the period' }).parentElement!;
    expect(within(kpis).getByText('$18.00')).toBeTruthy();
    expect(within(kpis).getByText('$6.00')).toBeTruthy();

    const chart = screen.getByRole('img', { name: /Sales over time: 3 periods/ });
    expect(chart.getAttribute('aria-label')).toContain('$15.00');

    const card = screen.getByRole('heading', { name: 'Sales over time' }).closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Table' }));
    const table = within(card).getByRole('table', { name: 'Sales over time' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(rows[2]!).getByText('$15.00')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    const status = screen.getByRole('heading', { name: 'Orders by status' }).closest('article')!;
    expect(within(status).getByText('Delivered')).toBeTruthy();
    expect(within(status).getByText('Cancelled')).toBeTruthy();
  });

  it('agrupar por semana y filtrar por sucursal piden el reporte de nuevo', async () => {
    const { api } = renderReports();
    await screen.findByRole('heading', { level: 1, name: 'Reports' });
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.query.get('granularity') === 'week')).toBe(true),
    );
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: LOCATION } });
    await waitFor(() =>
      expect(api.calls.some((c) => c.query.get('locationId') === LOCATION)).toBe(true),
    );
  });

  it('un rango invertido se marca y no se pide', async () => {
    const { api } = renderReports();
    const from = (await screen.findByLabelText('From')) as HTMLInputElement;
    const before = api.count('GET', '/api/staff/reports/sales');
    fireEvent.change(from, { target: { value: '2026-04-01' } });
    expect(screen.getByText(/start date must be on or before/)).toBeTruthy();
    expect(api.count('GET', '/api/staff/reports/sales')).toBe(before);
  });

  it('sin ventas: ceros y avisos en vez de gráficos vacíos', async () => {
    renderReports({
      respond: () =>
        json(
          makeReport({
            totals: {
              orders: 0,
              salesCents: 0,
              averageTicketCents: 0,
              discountCents: 0,
              cancelledOrders: 0,
            },
            series: [{ period: '2026-03-01', orders: 0, salesCents: 0 }],
            byStatus: [],
            topProducts: [],
            peakHours: Array.from({ length: 24 }, (_, hour) => ({
              hour,
              orders: 0,
              salesCents: 0,
            })),
          }),
        ),
    });
    expect((await screen.findAllByText('Nothing to show in this period.')).length).toBe(4);
  });

  it('plan sin reportes: invita a cambiar de plan (dueño)', async () => {
    renderReports({
      respond: () =>
        json(
          {
            statusCode: 403,
            message: 'El plan Pro no incluye reportes de ventas',
            error: 'Forbidden',
            code: 'plan_limit',
            limit: { resource: 'reports', plan: 'pro', planName: 'Pro', max: null },
          },
          403,
        ),
    });
    expect(await screen.findByText('Sales reports come with the Chain plan')).toBeTruthy();
    expect(screen.getByText(/Your Pro plan doesn’t include reports/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See plans' }).getAttribute('href')).toBe(
      '/admin/facturacion',
    );
  });

  it('filtros inválidos en la URL: «Limpiar filtros» vuelve al reporte por defecto', async () => {
    const { api } = renderReports({
      path: '/admin/reports?location=nope&from=2026-01-01',
      respond: (query) =>
        query.get('locationId')
          ? json({ statusCode: 400, message: 'locationId inválido', error: 'Bad Request' }, 400)
          : json(makeReport()),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    const last = api.calls.filter((c) => c.path === '/api/staff/reports/sales').at(-1)!;
    expect(last.query.get('locationId')).toBeNull();
    expect(last.query.get('from')).toBeNull();
  });

  it('un año fuera de 2000–2100 se marca y no se pide', async () => {
    const { api } = renderReports();
    const to = (await screen.findByLabelText('To')) as HTMLInputElement;
    const before = api.count('GET', '/api/staff/reports/sales');
    fireEvent.change(to, { target: { value: '9999-12-31' } });
    expect(screen.getByText('Choose dates between 2000 and 2100.')).toBeTruthy();
    expect(api.count('GET', '/api/staff/reports/sales')).toBe(before);
  });
});
