/**
 * Datos del sitio que no dependen del entorno de Vite. Los importa también el plugin de SEO
 * del build (`seo-plugin.ts`, en Node), así que nada de `import.meta.env` acá.
 */

/**
 * Origen público de la landing, el registro y el panel de plataforma. Desde TASK-007 es
 * `app.ventea.tech`; el apex y `www` redirigen acá (301, deploy/nginx.conf).
 */
export const SITE_URL = 'https://app.ventea.tech';
export const SITE_NAME = 'Ventea';

/**
 * Razón social del prestador del servicio. Placeholder «Ventea» mientras no exista la
 * sociedad; aparece en los términos y la política de privacidad.
 */
export const LEGAL_NAME = 'Ventea';
/** País cuya ley rige los términos. */
export const LEGAL_COUNTRY = 'Honduras';

/** El contacto es el único canal mientras no haya soporte. */
export const CONTACT_EMAIL = 'hola@ventea.tech';

/**
 * WhatsApp de ventas en formato internacional sin `+` ni espacios (p. ej. `50499998888`).
 * Vacío = el botón flotante no se muestra.
 */
export const WHATSAPP = '';

/** Marca de demostración con menú cargado, para el link «Ver una demo en vivo». */
export const DEMO_URL = 'https://demo-burgers.ventea.tech';

/**
 * Versión vigente de términos y privacidad: la que se manda en el registro como
 * `acceptedTermsVersion`. Tiene que ser la última de `TERMS_VERSIONS` de `@ventea/shared` (lo
 * comprueba un test); se copia acá para no meter zod en el bundle de la landing.
 */
export const TERMS_VERSION = '2026-10-08';
/** Fecha visible de la última actualización de los textos legales. */
export const LEGAL_UPDATED_LABEL = '8 de octubre de 2026';

/** Días de prueba del registro self-service (ADR 0007). */
export const TRIAL_DAYS = 14;
