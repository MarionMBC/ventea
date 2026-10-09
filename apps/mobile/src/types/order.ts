import type { Product, ProductExtra } from './product';

export type OrderStatus = 'received' | 'kitchen' | 'onTheWay' | 'delivered' | 'cancelled';

/** Delivery vs pickup, the top-level fulfilment choice. */
export type FulfilmentMode = 'delivery' | 'pickup';

export interface CartLine {
  id: string;
  /** `product.id` is the API `menuItemId` the order is placed with. */
  product: Product;
  quantity: number;
  /** Every chosen option, spelled out on the cart card. */
  extras: ProductExtra[];
  /** API option ids, sent as `selectedOptionIds`. */
  selectedOptionIds: string[];
  /** Unit price plus extras, times quantity. */
  lineTotal: number;
}

export interface Order {
  id: string;
  /** Customer facing number, e.g. "DB-2481". */
  reference: string;
  /** ISO date string. */
  placedAt: string;
  status: OrderStatus;
  total: number;
  /** One line summary, e.g. "2× Classic burger · 1× Lemonade". */
  summary: string;
  lines: CartLine[];
  mode: FulfilmentMode;
  /** Minutes remaining, only meaningful while the order is in progress. */
  etaMinutes?: number;
  /** Amounts as charged by the API. */
  subtotal?: number;
  discount?: number;
  pointsEarned?: number;
  pointsRedeemed?: number;
  /** Only a just-confirmed order can still be cancelled by the guest. */
  cancellable?: boolean;
}

/** The four fixed steps of the tracking timeline. */
export interface OrderStep {
  status: Exclude<OrderStatus, 'cancelled'>;
  icon: string;
}
