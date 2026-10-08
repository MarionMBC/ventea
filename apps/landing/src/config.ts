/** Datos fijos de la landing. El contacto es el único canal mientras no haya soporte. */
export const CONTACT_EMAIL = 'hola@ventea.tech';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'ventea.tech';

/** Días de prueba del registro self-service (ADR 0007). */
export const TRIAL_DAYS = 14;

/** Rango de comisión típico de las apps de delivery, para la comparación. */
export const DELIVERY_COMMISSION = { min: 0.2, max: 0.3 } as const;
