import { useState } from 'react';

import { describeError, useI18n } from '@/i18n';
import { IconAlert, IconHistory } from '@/ui/icons';

import { startOfLocalDay } from './api';
import { useNow, useOrderHistory } from './hooks';
import { useOrdersContext } from './OrdersSection';
import { statusLabel } from './transitions';

function HistorySkeleton({ label }: { label: string }) {
  return (
    <div className="history" role="status">
      <span className="sr-only">{label}</span>
      <div className="history__list" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="history-row history-row--skeleton">
            <span className="skeleton" style={{ width: '6rem', height: 20 }} />
            <span className="skeleton" style={{ width: '60%', height: 16 }} />
            <span className="skeleton" style={{ width: '4rem', height: 20 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` en hora local: el valor de un `<input type="date">`. */
const toDayValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDayValue = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/**
 * Entregados y cancelados de un día (hoy por defecto, día del dispositivo). Solo lectura.
 * «Hoy» sigue al reloj: pasada la medianoche carga el día nuevo sola. Elegido otro día, se
 * queda en él hasta tocar «Hoy».
 */
export function OrdersHistory() {
  const { t } = useI18n();
  const now = useNow(60_000);
  const today = startOfLocalDay(new Date(now));
  const [picked, setPicked] = useState<string | null>(null);
  const since = picked ? fromDayValue(picked) : today;
  const isToday = since.getTime() === today.getTime();
  const until = new Date(since.getFullYear(), since.getMonth(), since.getDate() + 1);

  return (
    <div className="history-page">
      <div className="history-day">
        <label className="history-day__label" htmlFor="history-day">
          {t('history.day')}
        </label>
        <input
          id="history-day"
          className="field__input history-day__input"
          type="date"
          value={toDayValue(since)}
          max={toDayValue(today)}
          onChange={(event) => {
            const value = event.target.value;
            // Vacío (campo borrado) o hoy: vuelve a seguir al reloj.
            setPicked(!value || value === toDayValue(today) ? null : value);
          }}
        />
        {!isToday && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setPicked(null)}
          >
            {t('history.today')}
          </button>
        )}
      </div>
      <HistoryDay since={since} until={until} isToday={isToday} />
    </div>
  );
}

function HistoryDay({ since, until, isToday }: { since: Date; until: Date; isToday: boolean }) {
  const { currency } = useOrdersContext();
  const i18n = useI18n();
  const { t, money, clock, customerName } = i18n;
  const { data: fetched, error, isPending, refetch } = useOrderHistory(since);
  // La API solo filtra «desde»: el tope del día se aplica acá.
  const orders = fetched?.filter((order) => order.placedAt.getTime() < until.getTime());

  if (isPending) return <HistorySkeleton label={t('history.loading')} />;

  if (!orders) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h2>{t('history.errorTitle')}</h2>
        <p>{describeError(error, i18n)}</p>
        <button type="button" className="btn btn--primary" onClick={() => void refetch()}>
          {t('board.retry')}
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="state state--empty">
        <span className="state__icon">
          <IconHistory size={30} />
        </span>
        <h2>{isToday ? t('history.emptyTitle') : t('history.emptyDay')}</h2>
        <p>{t('history.emptyBody')}</p>
      </div>
    );
  }

  const delivered = orders.filter((order) => order.status === 'completed');
  const sales = delivered.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <section className="history" aria-label={isToday ? t('history.label') : t('history.labelDay')}>
      <dl className="stats" aria-label={t('history.summary')}>
        <div className="stat">
          <dt>{t('history.delivered')}</dt>
          <dd>{delivered.length}</dd>
        </div>
        <div className="stat">
          <dt>{t('history.cancelled')}</dt>
          <dd>{orders.length - delivered.length}</dd>
        </div>
        <div className="stat">
          <dt>{t('history.sales')}</dt>
          <dd>{money(sales, currency)}</dd>
        </div>
      </dl>

      <ol className="history__list">
        {orders.map((order) => {
          const items = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          return (
            <li key={order.id} className={`history-row history-row--${order.status}`}>
              <span className="history-row__code">{order.code}</span>
              <span className="history-row__time">
                <time dateTime={order.placedAt.toISOString()}>{clock(order.placedAt)}</time>
              </span>
              <span className="history-row__customer">
                {customerName(order.customer)}
                <span className="history-row__meta">
                  {t(`fulfillment.${order.fulfillmentType}`)} · {t('card.items', { count: items })}
                </span>
              </span>
              <span className={`status-chip status-chip--${order.status}`}>
                {t(statusLabel(order.status))}
              </span>
              <span className="history-row__total">{money(order.totalCents, currency)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
