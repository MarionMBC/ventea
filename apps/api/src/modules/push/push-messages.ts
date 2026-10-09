import { ORDER_PUSH_STATUSES, type BrandLanguage, type OrderPushStatus } from '@ventea/shared';

/** Texto de la notificación de cambio de estado del pedido, en el idioma de la marca. */
const TEXTS: Record<BrandLanguage, Record<OrderPushStatus, (code: string) => string>> = {
  es: {
    preparing: (code) => `Estamos preparando tu pedido ${code}.`,
    ready: (code) => `¡Tu pedido ${code} está listo para retirar!`,
    completed: (code) => `Pedido ${code} entregado. ¡Gracias por tu compra!`,
    cancelled: (code) => `Tu pedido ${code} fue cancelado.`,
  },
  en: {
    preparing: (code) => `We're preparing your order ${code}.`,
    ready: (code) => `Your order ${code} is ready for pickup!`,
    completed: (code) => `Order ${code} delivered. Thanks for your purchase!`,
    cancelled: (code) => `Your order ${code} was cancelled.`,
  },
};

export function isOrderPushStatus(status: string): status is OrderPushStatus {
  return (ORDER_PUSH_STATUSES as readonly string[]).includes(status);
}

export function brandLanguage(value: string | null | undefined): BrandLanguage {
  return value === 'en' ? 'en' : 'es';
}

export function orderPushText(
  language: BrandLanguage,
  status: OrderPushStatus,
  code: string,
  brandName: string,
): { title: string; body: string } {
  return { title: brandName, body: TEXTS[language][status](code) };
}
