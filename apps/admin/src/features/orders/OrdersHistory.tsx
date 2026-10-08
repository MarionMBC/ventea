import { useState } from 'react';

import { customerName, formatAmount, formatClock, fulfillmentLabel } from '@/lib/format';

import { startOfLocalDay } from './api';
import { useOrderHistory } from './hooks';
import { useOrdersContext } from './OrdersSection';
import { statusLabel } from './transitions';

/** Entregados y cancelados de hoy (día del dispositivo). Solo lectura. */
export function OrdersHistory() {
  const { currency } = useOrdersContext();
  // El día se fija al abrir la vista; si queda abierta pasada la medianoche,
  // recargar la página muestra el día nuevo.
  const [since] = useState(() => startOfLocalDay(new Date()));
  const { data: orders, error, isPending, refetch } = useOrderHistory(since);

  if (isPending) {
    return (
      <p className="state state--loading" role="status">
        Cargando historial…
      </p>
    );
  }

  if (!orders) {
    return (
      <div className="state state--error" role="alert">
        <h2>No pudimos cargar el historial</h2>
        <p>{error?.message}</p>
        <button type="button" className="btn btn--primary" onClick={() => void refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="state state--empty">
        <h2>Todavía no hay pedidos entregados ni cancelados hoy</h2>
      </div>
    );
  }

  return (
    <section className="history" aria-label="Historial de hoy">
      <ol className="history__list">
        {orders.map((order) => {
          const items = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          return (
            <li key={order.id} className={`history-row history-row--${order.status}`}>
              <span className="history-row__code">{order.code}</span>
              <span className="history-row__time">
                <time dateTime={order.placedAt.toISOString()}>{formatClock(order.placedAt)}</time>
              </span>
              <span className="history-row__customer">
                {customerName(order.customer)}
                <span className="history-row__meta">
                  {fulfillmentLabel(order.fulfillmentType)} · {items}{' '}
                  {items === 1 ? 'producto' : 'productos'}
                </span>
              </span>
              <span className={`status-chip status-chip--${order.status}`}>
                {statusLabel(order.status)}
              </span>
              <span className="history-row__total">{formatAmount(order.totalCents, currency)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
