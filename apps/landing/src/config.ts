/** Datos fijos de la landing. Los que no dependen del entorno viven en `site.ts`. */
export {
  CONTACT_EMAIL,
  DEMO_URL,
  LEGAL_COUNTRY,
  LEGAL_NAME,
  LEGAL_UPDATED_LABEL,
  SITE_URL,
  TERMS_VERSION,
  TRIAL_DAYS,
  WHATSAPP,
} from './site';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'ventea.tech';
