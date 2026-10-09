/**
 * Datos fijos del sitio corporativo. Los importa también el prerender del build (Node): nada de
 * `import.meta.env` acá.
 */
export const config = {
  companyName: 'Ventea',
  /** Origen público del sitio (apex). `www` redirige acá (deploy/nginx.conf). */
  siteUrl: 'https://ventea.tech',
  /** Destino del formulario de contacto (`mailto:`). */
  contactEmail: 'hola@ventea.tech',
  /**
   * Producto propio: Ventea para restaurantes (SaaS). Su landing es bilingüe con inglés en la
   * raíz y español en /es/: cada versión del sitio enlaza la de su idioma.
   */
  restaurantsUrl: { en: 'https://app.ventea.tech/', es: 'https://app.ventea.tech/es/' },
  restaurantsPrivacyUrl: 'https://app.ventea.tech/privacidad',
  /** Producto propio: Ventea Marketing (en español). */
  marketingUrl: 'https://marketing.ventea.tech',
  marketingPricingUrl: 'https://marketing.ventea.tech/precios',
} as const;

export type SiteConfig = typeof config;
