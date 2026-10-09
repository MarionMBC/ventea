import type { BrandConfig } from './config';

/**
 * Borrador de los textos de tienda (Play Console y App Store Connect) desde el branding. Es
 * un punto de partida para quien publica: lo que falta queda marcado `‹completar›`.
 */

export interface ListingExtras {
  storeShortDescription: string | null;
  supportEmail: string | null;
  websiteUrl: string | null;
  publisher: 'ventea' | 'client' | null;
}

const TODO = '‹completar›';

const texts = {
  es: {
    title: 'Textos de tienda',
    short: (name: string) => `Pide en ${name}, sigue tu pedido y suma puntos.`,
    full: (name: string) =>
      [
        `La app oficial de ${name}.`,
        '',
        '• Mira el menú con fotos y precios actualizados.',
        '• Arma tu pedido y elige la sucursal.',
        '• Sigue el estado de tu pedido en tiempo real y recibe un aviso cuando esté listo.',
        '• Suma puntos con cada compra y canjéalos por descuentos.',
        '',
        `${name} es responsable del menú, los precios y la atención de los pedidos.`,
      ].join('\n'),
    review: (name: string) =>
      `Es la app oficial del restaurante ${name}, con su menú, sus sucursales y su programa de ` +
      'puntos. El restaurante es responsable del contenido. Cuenta de prueba: ' +
      `${TODO} (email) / ${TODO} (contraseña).`,
  },
  en: {
    title: 'Store listing',
    short: (name: string) => `Order from ${name}, track your order and earn points.`,
    full: (name: string) =>
      [
        `The official ${name} app.`,
        '',
        '• Browse the menu with up-to-date photos and prices.',
        '• Build your order and pick the location.',
        '• Track your order live and get notified when it is ready.',
        '• Earn points on every order and redeem them for discounts.',
        '',
        `${name} is responsible for the menu, prices and order fulfilment.`,
      ].join('\n'),
    review: (name: string) =>
      `This is the official app of the restaurant ${name}, with its own menu, locations and ` +
      'loyalty programme. The restaurant is responsible for the content. Demo account: ' +
      `${TODO} (email) / ${TODO} (password).`,
  },
} as const;

export function storeListing(
  brand: BrandConfig,
  extras: ListingExtras,
  version: string,
  buildNumber: number,
): string {
  const t = texts[brand.defaultLanguage];
  const name = brand.appName;
  const short = (extras.storeShortDescription ?? t.short(name)).slice(0, 80);
  const account =
    extras.publisher === 'client'
      ? 'Cuenta de developer del cliente (publisher = client)'
      : extras.publisher === 'ventea'
        ? 'Cuenta de developer de Ventea (publisher = ventea)'
        : TODO;
  return [
    `# ${t.title} — ${name} ${version} (${buildNumber})`,
    '',
    `- **Cuenta que publica:** ${account}`,
    `- **Bundle id / applicationId:** \`${brand.bundleId}\``,
    `- **Nombre (≤ 30):** ${name.slice(0, 30)}`,
    `- **Descripción corta (≤ 80):** ${short}`,
    '- **Categoría:** Comida y bebida (Food & Drink)',
    `- **Email de soporte:** ${extras.supportEmail ?? TODO}`,
    `- **Sitio web:** ${extras.websiteUrl ?? TODO}`,
    `- **Política de privacidad (URL):** ${TODO} (incluye el borrado de cuenta)`,
    '- **Clasificación de edad:** cuestionario de la tienda; sin contenido sensible',
    '- **Seguridad de datos / etiquetas de privacidad:** email y nombre (cuenta), historial de ' +
      'pedidos, token de dispositivo para avisos; sin venta a terceros; cifrado en tránsito',
    '- **Capturas:** propias de la marca (menú, producto, carrito, seguimiento, puntos)',
    '',
    '## Descripción larga',
    '',
    t.full(name),
    '',
    '## Nota para la revisión (App Store, guía 4.2.6)',
    '',
    t.review(name),
    '',
  ].join('\n');
}
