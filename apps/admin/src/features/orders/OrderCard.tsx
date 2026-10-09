import type { FulfillmentType, OrderStatus, StaffOrder } from '@ventea/shared';
import { useId, useState, type ComponentType } from 'react';

import { useI18n } from '@/i18n';
import { minutesSince } from '@/lib/format';
import {
  IconArrowRight,
  IconBag,
  IconCheck,
  IconClock,
  IconNote,
  IconPhone,
  IconTruck,
  IconUtensils,
} from '@/ui/icons';

import { canCancel, primaryAction, type StatusAction } from './transitions';

/**
 * Minutos desde que entró el pedido a partir de los que el reloj de la tarjeta se pone en
 * ámbar (`warn`) y en rojo (`late`), según la columna. Solo visual: no cambia nada del flujo.
 * El «nuevo sin empezar ≥ 10 min = demorado» es el criterio que ya usaba el tablero.
 */
const URGENCY: Partial<Record<OrderStatus, { warn: number; late: number }>> = {
  confirmed: { warn: 5, late: 10 },
  preparing: { warn: 15, late: 25 },
  ready: { warn: 10, late: 20 },
};

export type Urgency = 'ok' | 'warn' | 'late';

export function urgencyOf(status: OrderStatus, minutes: number): Urgency {
  const limits = URGENCY[status];
  if (!limits) return 'ok';
  if (minutes >= limits.late) return 'late';
  return minutes >= limits.warn ? 'warn' : 'ok';
}

const FULFILLMENT_ICON: Record<FulfillmentType, ComponentType<{ size?: number }>> = {
  pickup: IconBag,
  dine_in: IconUtensils,
  delivery: IconTruck,
};

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
  const { t, rich, money, clock, elapsed, customerName } = useI18n();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const titleId = useId();
  const action = primaryAction(order.status);
  const urgency = urgencyOf(order.status, minutesSince(order.placedAt, now));
  const amount = (cents: number) => money(cents, currency);
  const TypeIcon = FULFILLMENT_ICON[order.fulfillmentType];
  const placedAt = t('card.placedAt', { time: clock(order.placedAt) });

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
            aria-label={t('card.markSeen', { code: order.code })}
          >
            {t('card.new')}
          </button>
        )}
        <span className={`timer timer--${urgency}`} title={placedAt}>
          <IconClock size={16} />
          <time dateTime={order.placedAt.toISOString()}>{elapsed(order.placedAt, now)}</time>
          <span className="sr-only">
            , {placedAt}
            {urgency === 'late' && `, ${t('card.late')}`}
          </span>
        </span>
      </header>

      <div className="order-card__meta">
        <span className={`chip chip--${order.fulfillmentType}`}>
          <TypeIcon size={16} />
          {t(`fulfillment.${order.fulfillmentType}`)}
        </span>
        <span className="order-card__customer">{customerName(order.customer)}</span>
        {order.customer?.phone && (
          <a className="order-card__phone" href={`tel:${order.customer.phone}`}>
            <IconPhone size={14} />
            {order.customer.phone}
          </a>
        )}
      </div>

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
              {line.notes && (
                <span className="note">{t('card.itemNote', { note: line.notes })}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {order.customerNotes && (
        <p className="note note--order">
          <IconNote size={18} />
          <span>
            <strong>{t('card.orderNote')}</strong> {order.customerNotes}
          </span>
        </p>
      )}

      <dl className="order-card__totals">
        {order.pointsRedeemed > 0 && (
          <div className="order-card__points">
            <dt>{t('card.pointsRedeemed')}</dt>
            <dd>
              {t('card.pointsValue', {
                points: order.pointsRedeemed,
                amount: amount(order.discountCents),
              })}
            </dd>
          </div>
        )}
        <div className="order-card__total">
          <dt>{t('card.total')}</dt>
          <dd>{amount(order.totalCents)}</dd>
        </div>
      </dl>

      {confirmingCancel ? (
        <div className="order-card__confirm" role="group" aria-label={t('card.confirmGroup')}>
          <p>
            {rich('card.confirmCancel', { code: <strong>{order.code}</strong> })}
            {order.pointsRedeemed > 0 &&
              ` ${t('card.confirmPoints', { count: order.pointsRedeemed })}`}
          </p>
          <div className="order-card__actions">
            <button
              type="button"
              className="btn btn--ghost"
              autoFocus
              onClick={() => setConfirmingCancel(false)}
            >
              {t('card.confirmNo')}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={isPending}
              onClick={(event) => {
                // La tarjeta sale del tablero: el foco pasa al título de su columna en vez
                // de perderse en <body>.
                const heading = event.currentTarget
                  .closest('section')
                  ?.querySelector<HTMLElement>('h2');
                setConfirmingCancel(false);
                onChangeStatus(order, { to: 'cancelled', label: 'action.cancel' });
                heading?.focus();
              }}
            >
              {t('card.confirmYes')}
            </button>
          </div>
        </div>
      ) : (
        <div className="order-card__actions">
          {canCancel(order.status) && (
            <button
              type="button"
              className="btn btn--quiet btn--small order-card__cancel"
              disabled={isPending}
              onClick={() => setConfirmingCancel(true)}
              aria-label={t('card.cancelAria', { code: order.code })}
            >
              {t('action.cancel')}
            </button>
          )}
          {action && (
            <button
              type="button"
              className={`btn btn--primary order-card__advance btn--to-${action.to}`}
              disabled={isPending}
              onClick={() => onChangeStatus(order, action)}
            >
              {t(action.label)}
              {action.to === 'completed' ? <IconCheck size={20} /> : <IconArrowRight size={20} />}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
