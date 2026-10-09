import { Badge } from '../ui/Badge';
import type { OrderStatus } from '../../types/order';
import { orderStatusLabel, orderStatusTone } from './orderStatus';

export interface OrderStatusBadgeProps {
  status: OrderStatus;
}

/** Order status as a subtle badge; the wording lives in `orderStatus.ts`. */
export const OrderStatusBadge = ({ status }: OrderStatusBadgeProps) => (
  <Badge tone={orderStatusTone(status)} subtle>
    {orderStatusLabel(status)}
  </Badge>
);
