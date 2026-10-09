/**
 * Datos fijos del sitio corporativo. Los importa también el plugin de SEO del build
 * (`seo-plugin.ts`, en Node): nada de `import.meta.env` acá.
 */
export const config = {
  companyName: 'Ventea',
  /** Origen público del sitio (apex). `www` redirige acá (deploy/nginx.conf). */
  siteUrl: 'https://ventea.tech',
  /** Destino del formulario de contacto (`mailto:`). */
  contactEmail: 'hola@ventea.tech',
  /**
   * WhatsApp en formato internacional, solo dígitos (p. ej. `50499998888`). Vacío = el link de
   * WhatsApp no se muestra.
   */
  whatsapp: '',
  /** Producto propio: Ventea for restaurants (landing del SaaS, en español). */
  productUrl: 'https://app.ventea.tech',
} as const;

export type SiteConfig = typeof config;
