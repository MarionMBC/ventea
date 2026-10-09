import { t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import type { BadgeTone } from '../ui/Badge';
import type { OrderStatus, OrderStep } from '../../types/order';

/** The one place an order status turns into words and a tone. */
const statusMeta: Record<OrderStatus, { key: MessageKey; tone: BadgeTone }> = {
  received: { key: 'status.received', tone: 'info' },
  kitchen: { key: 'status.kitchen', tone: 'warning' },
  /* Every order is pickup for now: `ready` maps here (see features/orders/mapOrder). */
  onTheWay: { key: 'status.ready', tone: 'info' },
  delivered: { key: 'status.pickedUp', tone: 'success' },
  cancelled: { key: 'status.cancelled', tone: 'danger' },
};

export const orderStatusLabel = (status: OrderStatus): string => t(statusMeta[status].key);
export const orderStatusTone = (status: OrderStatus): BadgeTone => statusMeta[status].tone;

const stepKeys: Record<OrderStep['status'], MessageKey> = {
  received: 'step.received',
  kitchen: 'step.kitchen',
  onTheWay: 'step.ready',
  delivered: 'step.pickedUp',
};

export const orderStepLabel = (status: OrderStep['status']): string => t(stepKeys[status]);

/** Fixed timeline rendered by OrderProgress; `cancelled` is never a step. */
export const orderSteps: OrderStep[] = [
  { status: 'received', icon: 'checkmark' },
  { status: 'kitchen', icon: 'flame' },
  { status: 'onTheWay', icon: 'bagHandle' },
  { status: 'delivered', icon: 'checkmarkCircle' },
];
