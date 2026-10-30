import type { Order } from '../../types/order';
import { OrderStatusBadge } from '../feedback/OrderStatusBadge';
import { Button } from '../ui/Button';
import { Price } from '../ui/Price';
import { ProductImage } from '../ui/ProductImage';
import { formatDate, t } from '../../i18n';
import './cards.css';

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export interface OrderCardProps {
  order: Order;
  onDetails?: (order: Order) => void;
  onReorder?: (order: Order) => void;
}

/** Order history row. Reference, date and status first; the total and the two
 *  actions close the card so the eye lands on "Reorder". */
export const OrderCard = ({ order, onDetails, onReorder }: OrderCardProps) => (
  <article className="vt-card vt-order">
    <div className="vt-row-between">
      <div className="vt-stack-1">
        <h3 className="vt-order__ref">{t('order.reference', { code: order.reference })}</h3>
        <span className="vt-caption">{formatDate(order.placedAt, DATE_FORMAT)}</span>
      </div>
      <OrderStatusBadge status={order.status} />
    </div>
    {order.lines.length > 0 && (
      <div className="vt-order__thumbs" aria-hidden="true">
        {order.lines.slice(0, 4).map((line) => (
          <div key={line.id} className="vt-order__thumb">
            <ProductImage src={line.product.imageUrl} alt="" ratio="1/1" />
          </div>
        ))}
      </div>
    )}
    <p className="vt-order__summary">{order.summary}</p>
    <hr className="vt-divider" />
    <div className="vt-row-between">
      <Price value={order.total} size="md" />
      <div className="vt-order__actions">
        {onDetails && (
          <Button variant="secondary" size="sm" onClick={() => onDetails(order)}>
            {t('order.details')}
          </Button>
        )}
        {onReorder && order.status !== 'cancelled' && (
          <Button variant="primary" size="sm" onClick={() => onReorder(order)}>
            {t('order.reorder')}
          </Button>
        )}
      </div>
    </div>
  </article>
);
