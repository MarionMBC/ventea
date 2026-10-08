import type { StaffOrder } from '@ventea/shared';
import { useId, useState } from 'react';

import {
  customerName,
  formatClock,
  formatAmount,
  formatElapsed,
  fulfillmentLabel,
  minutesSince,
} from '@/lib/format';

import { canCancel, primaryAction, type StatusAction } from './transitions';

/** Un pedido nuevo que lleva más de esto sin empezarse se marca como demorado. */
const LATE_AFTER_MIN = 10;

interface OrderCardProps {
  order: StaffOrder;
  currency: string | undefined;
  now: number;
  isFresh: boolean;
  isPending: boolean;
  onChangeStatus: (order: StaffOrder, action: StatusAction) => void;
  onSeen: (orderId: string) => void;
}

export function OrderCard({
  order,
  currency,
  now,
  isFresh,
  isPending,
  onChangeStatus,
  onSeen,
}: OrderCardProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const titleId = useId();
  const action = primaryAction(order.status);
  const minutes = minutesSince(order.placedAt, now);
  const isLate = order.status === 'confirmed' && minutes >= LATE_AFTER_MIN;
  const money = (cents: number) => formatAmount(cents, currency);

  return (
    <article
      className={`order-card order-card--${order.status}${isFresh ? ' is-fresh' : ''}`}
      aria-labelledby={titleId}
      data-testid={`order-${order.code}`}
    >
      <header className="order-card__head">
        <h3 className="order-card__code" id={titleId}>
          {order.code}
        </h3>
        {isFresh && (
          <button
            type="button"
            className="badge badge--fresh"
            onClick={() => onSeen(order.id)}
            title="Marcar como visto"
          >
            Nuevo
          </button>
        )}
        <span className="badge badge--type">{fulfillmentLabel(order.fulfillmentType)}</span>
      </header>

      <p className="order-card__time">
        <time dateTime={order.placedAt.toISOString()}>{formatClock(order.placedAt)}</time>
        <span aria-hidden="true"> · </span>
        <span className={isLate ? 'is-late' : undefined}>{formatElapsed(order.placedAt, now)}</span>
      </p>

      <p className="order-card__customer">
        <span className="order-card__customer-name">{customerName(order.customer)}</span>
        {order.customer?.phone && (
          <a className="order-card__phone" href={`tel:${order.customer.phone}`}>
            {order.customer.phone}
          </a>
        )}
      </p>

      <ul className="order-card__lines">
        {order.lines.map((line) => (
          <li key={line.id} className="order-line">
            <span className="order-line__qty">{line.quantity}×</span>
            <div className="order-line__body">
              <span className="order-line__name">{line.nameSnapshot}</span>
              {line.selectedOptions.length > 0 && (
                <span className="order-line__options">
                  {line.selectedOptions.map((option) => option.nameSnapshot).join(', ')}
                </span>
              )}
              {line.notes && <span className="note">Nota: {line.notes}</span>}
            </div>
          </li>
        ))}
      </ul>

      {order.customerNotes && (
        <p className="note note--order">
          <strong>Nota del pedido:</strong> {order.customerNotes}
        </p>
      )}

      <dl className="order-card__totals">
        {order.pointsRedeemed > 0 && (
          <div className="order-card__points">
            <dt>Puntos canjeados</dt>
            <dd>
              {order.pointsRedeemed} pts (−{money(order.discountCents)})
            </dd>
          </div>
        )}
        <div className="order-card__total">
          <dt>Total</dt>
          <dd>{money(order.totalCents)}</dd>
        </div>
      </dl>

      {confirmingCancel ? (
        <div className="order-card__confirm" role="group" aria-label="Confirmar cancelación">
          <p>
            ¿Cancelar el pedido <strong>{order.code}</strong>?
            {order.pointsRedeemed > 0 && ` Se devuelven ${order.pointsRedeemed} puntos al cliente.`}
          </p>
          <div className="order-card__actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={isPending}
              onClick={() => {
                setConfirmingCancel(false);
                onChangeStatus(order, { to: 'cancelled', label: 'Cancelar' });
              }}
            >
              Sí, cancelar
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              autoFocus
              onClick={() => setConfirmingCancel(false)}
            >
              No, volver
            </button>
          </div>
        </div>
      ) : (
        <div className="order-card__actions">
          {action && (
            <button
              type="button"
              className={`btn btn--primary btn--to-${action.to}`}
              disabled={isPending}
              onClick={() => onChangeStatus(order, action)}
            >
              {action.label}
            </button>
          )}
          {canCancel(order.status) && (
            <button
              type="button"
              className="btn btn--ghost"
              disabled={isPending}
              onClick={() => setConfirmingCancel(true)}
              aria-label={`Cancelar pedido ${order.code}`}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </article>
  );
}
