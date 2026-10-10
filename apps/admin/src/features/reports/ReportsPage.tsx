import {
  REPORT_GRANULARITY,
  REPORT_MAX_DAYS,
  REPORT_MAX_YEAR,
  REPORT_MIN_YEAR,
  type ReportGranularity,
  type SalesReport,
} from '@ventea/shared';
import { useEffect, useId, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { useSession } from '@/app/services';
import { describeError, useI18n, type I18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { IconAlert, IconChart, IconRefresh } from '@/ui/icons';

import { useSalesReport, type ReportFilters } from './api';
import { BarList, ChartCard, ColumnChart, type ChartPoint } from './charts';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRESETS = [7, 30, 90] as const;

/** `AAAA-MM-DD` de hoy en la zona de la marca. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Año dentro de lo que la API acepta (fuera, 400). */
function inYears(day: string): boolean {
  const year = Number(day.slice(0, 4));
  return year >= REPORT_MIN_YEAR && year <= REPORT_MAX_YEAR;
}

/** Días del rango, inclusive. */
function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** Una fecha `AAAA-MM-DD` como fecha de calendario (sin zona: se formatea en UTC). */
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function periodLabels(
  period: string,
  granularity: ReportGranularity,
  { locale, t }: Pick<I18n, 'locale' | 't'>,
): { short: string; long: string } {
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(asDate(period));
  if (granularity === 'month') {
    return { short: fmt({ month: 'short' }), long: fmt({ month: 'long', year: 'numeric' }) };
  }
  const short = fmt({ day: 'numeric', month: 'short' });
  const long = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
  return granularity === 'week'
    ? { short, long: t('reports.weekOf', { date: long }) }
    : { short, long: fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) };
}

function hourLabel(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: 'numeric' }).format(
    new Date(Date.UTC(2020, 0, 1, hour)),
  );
}

/** Centavos → unidades con punto decimal (CSV: número, sin símbolo ni miles). */
const csvAmount = (cents: number) => Math.round(cents) / 100;

function parseGranularity(value: string | null): ReportGranularity {
  return (REPORT_GRANULARITY as readonly string[]).includes(value ?? '')
    ? (value as ReportGranularity)
    : 'day';
}

/** Resumen accesible de una serie: cuántos puntos y cuál fue el más alto. */
function summarize(name: string, points: readonly ChartPoint[], t: I18n['t']): string {
  const top = points.reduce<ChartPoint | null>(
    (best, point) => (point.value > (best?.value ?? 0) ? point : best),
    null,
  );
  if (!top) return t('reports.chartEmpty', { name });
  return t('reports.chartSummary', {
    name,
    count: points.length,
    label: top.label,
    value: top.display,
  });
}

/**
 * Reportes (`/admin/reports`, dueño y gerente): ventas por día/semana/mes, ticket promedio,
 * pedidos por estado, productos más vendidos y horas pico, por sucursal y rango de fechas.
 * Cada gráfico tiene su tabla y su CSV. Los filtros viven en la URL (se pueden compartir).
 */
export function ReportsPage() {
  const session = useSession();
  const canSee = session?.staff.role === 'owner' || session?.staff.role === 'manager';
  const i18n = useI18n();
  const { t } = i18n;
  const [params, setParams] = useSearchParams();
  const filters: ReportFilters = {
    from: ISO_DATE.test(params.get('from') ?? '') ? params.get('from')! : undefined,
    to: ISO_DATE.test(params.get('to') ?? '') ? params.get('to')! : undefined,
    locationId: params.get('location') || undefined,
    granularity: parseGranularity(params.get('group')),
  };
  const report = useSalesReport(filters);

  useEffect(() => {
    document.title = t('reports.pageTitle');
  }, [t]);

  if (session && !canSee) return <Navigate to="/orders" replace />;

  const error = report.error;
  if (error instanceof ApiError && error.code === 'plan_limit') {
    return <Upsell plan={error.limit?.plan ?? null} planName={error.limit?.planName ?? null} />;
  }
  if (error && !report.data) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('reports.errorTitle')}</h1>
        <p>{describeError(error, i18n)}</p>
        {/* Filtros inválidos en la URL (400): reintentar repetiría lo mismo; se limpian. Sin
            `params.size`: Safari < 17 no lo tiene. */}
        {error instanceof ApiError && error.status === 400 && params.toString() !== '' ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            {t('reports.clearFilters')}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => void report.refetch()}>
            <IconRefresh size={18} />
            {t('board.retry')}
          </button>
        )}
      </div>
    );
  }
  if (!report.data) {
    return (
      <div className="page" role="status">
        <span className="sr-only">{t('reports.loading')}</span>
        <div className="page-grid" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="card card--skeleton">
              <span className="skeleton" style={{ width: '40%', height: 22 }} />
              <span className="skeleton" style={{ width: '90%', height: 14 }} />
              <span className="skeleton" style={{ width: '75%', height: 14 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const update = (next: Partial<Record<'from' | 'to' | 'location' | 'group', string | null>>) => {
    setParams(
      (prev) => {
        const merged = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          if (value) merged.set(key, value);
          else merged.delete(key);
        }
        return merged;
      },
      { replace: true },
    );
  };

  return (
    <Report
      data={report.data}
      fetching={report.isFetching}
      error={error ? describeError(error, i18n) : null}
      onChange={update}
    />
  );
}

function Report({
  data,
  fetching,
  error,
  onChange,
}: {
  data: SalesReport;
  fetching: boolean;
  error: string | null;
  onChange: (next: Partial<Record<'from' | 'to' | 'location' | 'group', string | null>>) => void;
}) {
  const i18n = useI18n();
  const { t, money, locale } = i18n;
  const id = useId();
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const range = draft ?? { from: data.from, to: data.to };
  const rangeError =
    !inYears(range.from) || !inYears(range.to)
      ? t('reports.yearInvalid', { min: REPORT_MIN_YEAR, max: REPORT_MAX_YEAR })
      : range.from > range.to
        ? t('reports.rangeInvalid')
        : spanDays(range.from, range.to) > REPORT_MAX_DAYS
          ? t('reports.rangeTooLong')
          : null;

  const setDate = (key: 'from' | 'to', value: string) => {
    const next = { ...range, [key]: value };
    if (!ISO_DATE.test(next.from) || !ISO_DATE.test(next.to)) {
      setDraft(next);
      return;
    }
    const valid =
      inYears(next.from) &&
      inYears(next.to) &&
      next.from <= next.to &&
      spanDays(next.from, next.to) <= REPORT_MAX_DAYS;
    setDraft(valid ? null : next);
    if (valid) onChange({ from: next.from, to: next.to });
  };

  const today = todayIn(data.timezone);
  const preset = (days: number) => ({ from: shiftDay(today, -(days - 1)), to: today });
  const currency = data.currency;
  const fmtMoney = (cents: number) => money(cents, currency);
  const filename = (name: string) => `${name}-${data.from}-${data.to}.csv`;
  const files = {
    sales: filename(t('reports.file.sales')),
    hours: filename(t('reports.file.hours')),
    products: filename(t('reports.file.products')),
    statuses: filename(t('reports.file.statuses')),
  };

  const series: ChartPoint[] = data.series.map((point) => {
    const labels = periodLabels(point.period, data.granularity, i18n);
    return {
      key: point.period,
      label: labels.long,
      short: labels.short,
      value: point.salesCents,
      display: fmtMoney(point.salesCents),
    };
  });
  const hours: ChartPoint[] = data.peakHours.map((hour) => ({
    key: String(hour.hour),
    label: hourLabel(hour.hour, locale),
    short: hourLabel(hour.hour, locale),
    value: hour.orders,
    display: String(hour.orders),
  }));
  const products: ChartPoint[] = data.topProducts.map((product, index) => ({
    key: `${product.menuItemId ?? 'name'}-${index}`,
    label: product.name,
    short: product.name,
    value: product.quantity,
    display: `${product.quantity} · ${fmtMoney(product.salesCents)}`,
  }));
  const statuses: ChartPoint[] = data.byStatus.map((row) => ({
    key: row.status,
    label: t(`status.${row.status}`),
    short: t(`status.${row.status}`),
    value: row.orders,
    display: String(row.orders),
  }));

  const noSales = data.totals.orders === 0;
  const salesTitle = t('reports.salesOverTime');
  const hoursTitle = t('reports.peakHours');

  return (
    <section className="page reports" aria-labelledby="reports-title">
      <header className="page-head">
        <div className="page-head__text">
          <h1 id="reports-title" className="page-head__title">
            {t('reports.title')}
          </h1>
          <p className="page-head__sub">{t('reports.subtitle', { tz: data.timezone })}</p>
        </div>
      </header>

      <form
        className="card reports__filters"
        aria-label={t('reports.filters')}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="reports__filter-row">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-location`}>
              {t('reports.location')}
            </label>
            <select
              id={`${id}-location`}
              className="field__input"
              value={data.locationId ?? ''}
              onChange={(event) => onChange({ location: event.target.value || null })}
            >
              <option value="">{t('reports.allLocations')}</option>
              {data.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.isActive
                    ? location.name
                    : t('reports.inactiveLocation', { name: location.name })}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-from`}>
              {t('reports.from')}
            </label>
            <input
              id={`${id}-from`}
              type="date"
              className="field__input"
              value={range.from}
              min={`${REPORT_MIN_YEAR}-01-01`}
              max={range.to}
              aria-invalid={!!rangeError}
              aria-describedby={rangeError ? `${id}-range-error` : undefined}
              onChange={(event) => setDate('from', event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-to`}>
              {t('reports.to')}
            </label>
            <input
              id={`${id}-to`}
              type="date"
              className="field__input"
              value={range.to}
              min={range.from}
              max={`${REPORT_MAX_YEAR}-12-31`}
              aria-invalid={!!rangeError}
              aria-describedby={rangeError ? `${id}-range-error` : undefined}
              onChange={(event) => setDate('to', event.target.value)}
            />
          </div>
        </div>
        {rangeError && (
          <p id={`${id}-range-error`} className="field__error" role="alert">
            {rangeError}
          </p>
        )}
        <div className="reports__filter-row reports__filter-row--chips">
          <div className="segmented" role="group" aria-label={t('reports.presets')}>
            {PRESETS.map((days) => {
              const value = preset(days);
              const active = !draft && data.from === value.from && data.to === value.to;
              return (
                <button
                  key={days}
                  type="button"
                  className={`segmented__item${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    setDraft(null);
                    onChange(value);
                  }}
                >
                  {t(`reports.last${days}`)}
                </button>
              );
            })}
          </div>
          <div className="segmented" role="group" aria-label={t('reports.groupBy')}>
            {REPORT_GRANULARITY.map((granularity) => (
              <button
                key={granularity}
                type="button"
                className={`segmented__item${data.granularity === granularity ? ' active' : ''}`}
                aria-pressed={data.granularity === granularity}
                onClick={() => onChange({ group: granularity === 'day' ? null : granularity })}
              >
                {t(`reports.granularity.${granularity}`)}
              </button>
            ))}
          </div>
          <span className="reports__status" role="status">
            {fetching ? t('reports.updating') : ''}
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>

      <section aria-labelledby={`${id}-kpis`} className="reports__kpis">
        <h2 id={`${id}-kpis`} className="sr-only">
          {t('reports.kpis')}
        </h2>
        <dl className="stats reports__stats">
          <div className="stat stat--lead">
            <dt>{t('reports.sales')}</dt>
            <dd>{fmtMoney(data.totals.salesCents)}</dd>
          </div>
          <div className="stat">
            <dt>{t('reports.orders')}</dt>
            <dd>{data.totals.orders}</dd>
          </div>
          <div className="stat">
            <dt>{t('reports.avgTicket')}</dt>
            <dd>{fmtMoney(data.totals.averageTicketCents)}</dd>
          </div>
          <div className="stat">
            <dt>{t('reports.cancelled')}</dt>
            <dd>{data.totals.cancelledOrders}</dd>
          </div>
          <div className="stat">
            <dt>{t('reports.discounts')}</dt>
            <dd>{fmtMoney(data.totals.discountCents)}</dd>
          </div>
        </dl>
        <p className="reports__note">{t('reports.salesNote')}</p>
      </section>

      <div className="reports__grid">
        <ChartCard
          wide
          title={salesTitle}
          columns={[
            { header: t('reports.colPeriod') },
            { header: t('reports.colOrders'), numeric: true },
            { header: t('reports.colSales'), numeric: true },
          ]}
          rows={data.series.map((point, index) => [
            series[index]!.label,
            point.orders,
            fmtMoney(point.salesCents),
          ])}
          csvRows={data.series.map((point) => [
            point.period,
            point.orders,
            csvAmount(point.salesCents),
          ])}
          filename={files.sales}
          empty={noSales ? t('reports.noData') : null}
        >
          <ColumnChart
            points={series}
            summary={summarize(salesTitle, series, t)}
            formatAxis={(value) => fmtMoney(Math.round(value))}
          />
        </ChartCard>

        <ChartCard
          title={hoursTitle}
          note={t('reports.peakHoursNote')}
          columns={[
            { header: t('reports.colHour') },
            { header: t('reports.colOrders'), numeric: true },
            { header: t('reports.colSales'), numeric: true },
          ]}
          rows={data.peakHours.map((hour, index) => [
            hours[index]!.label,
            hour.orders,
            fmtMoney(hour.salesCents),
          ])}
          csvRows={data.peakHours.map((hour) => [
            hour.hour,
            hour.orders,
            csvAmount(hour.salesCents),
          ])}
          filename={files.hours}
          empty={noSales ? t('reports.noData') : null}
        >
          <ColumnChart
            points={hours}
            summary={summarize(hoursTitle, hours, t)}
            formatAxis={(value) => String(Math.round(value))}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.topProducts')}
          note={t('reports.topProductsNote')}
          columns={[
            { header: t('reports.colProduct') },
            { header: t('reports.colUnits'), numeric: true },
            { header: t('reports.colSales'), numeric: true },
          ]}
          rows={data.topProducts.map((product) => [
            product.name,
            product.quantity,
            fmtMoney(product.salesCents),
          ])}
          csvRows={data.topProducts.map((product) => [
            product.name,
            product.quantity,
            csvAmount(product.salesCents),
          ])}
          filename={files.products}
          empty={products.length === 0 ? t('reports.noData') : null}
        >
          <BarList points={products} />
        </ChartCard>

        <ChartCard
          title={t('reports.byStatus')}
          columns={[
            { header: t('reports.colStatus') },
            { header: t('reports.colOrders'), numeric: true },
          ]}
          rows={statuses.map((row) => [row.label, row.value])}
          csvRows={data.byStatus.map((row) => [t(`status.${row.status}`), row.orders])}
          filename={files.statuses}
          empty={statuses.length === 0 ? t('reports.noData') : null}
        >
          <BarList points={statuses} />
        </ChartCard>
      </div>
    </section>
  );
}

/** El plan no incluye reportes: qué se gana y cómo cambiar de plan (el dueño). */
function Upsell({ plan, planName }: { plan: string | null; planName: string | null }) {
  const session = useSession();
  const { t } = useI18n();
  const isOwner = session?.staff.role === 'owner';
  const name =
    plan === 'basic' || plan === 'pro' || plan === 'chain'
      ? t(`plan.${plan}`)
      : (planName ?? t('errors.yourPlan'));
  return (
    <div className="state state--empty reports-upsell">
      <span className="state__icon">
        <IconChart size={30} />
      </span>
      <h1>{t('reports.upsellTitle')}</h1>
      <p>{t('reports.upsellBody', { plan: name })}</p>
      {isOwner ? (
        <Link className="btn btn--primary" to="/facturacion">
          {t('reports.upsellCta')}
        </Link>
      ) : (
        <p>{t('reports.upsellManager')}</p>
      )}
    </div>
  );
}
