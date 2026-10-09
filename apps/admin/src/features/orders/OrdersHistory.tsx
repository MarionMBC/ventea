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

/** Entregados y cancelados de hoy (día del dispositivo). Solo lectura. */
export function OrdersHistory() {
  const { currency } = useOrdersContext();
  const i18n = useI18n();
  const { t, money, clock, customerName } = i18n;
  // «Hoy» se recalcula con el reloj: pasada la medianoche cambia la clave de la
  // consulta y la vista carga el día nuevo sola.
  const now = useNow(60_000);
  const since = startOfLocalDay(new Date(now));
  const { data: orders, error, isPending, refetch } = useOrderHistory(since);

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
        <h2>{t('history.emptyTitle')}</h2>
        <p>{t('history.emptyBody')}</p>
      </div>
    );
  }

  const delivered = orders.filter((order) => order.status === 'completed');
  const sales = delivered.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <section className="history" aria-label={t('history.label')}>
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
