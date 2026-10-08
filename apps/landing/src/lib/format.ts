import type { BillingInterval } from '@ventea/shared';

/** Precio en dólares sin decimales si es entero: `$25`, `$20.83`. */
export function formatUsd(cents: number): string {
  const amount = cents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `$${formatted}`;
}

/** Precio del intervalo elegido. */
export function priceFor(
  plan: { priceMonthlyCents: number; priceYearlyCents: number },
  interval: BillingInterval,
): number {
  return interval === 'year' ? plan.priceYearlyCents : plan.priceMonthlyCents;
}

/** Ahorro del anual frente a 12 meses: el «2 meses gratis». */
export function yearlySavingsCents(plan: {
  priceMonthlyCents: number;
  priceYearlyCents: number;
}): number {
  return Math.max(0, plan.priceMonthlyCents * 12 - plan.priceYearlyCents);
}

/**
 * Slug a partir del nombre del restaurante: minúsculas, sin acentos ni eñes, guiones
 * simples, 63 caracteres como máximo (límite de un label DNS).
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

/** Mismo formato que exige la API (`tenantSlugSchema`), para no consultar en vano. */
export function isSlugFormatValid(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 63 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

/**
 * Fuerza orientativa de la contraseña (0–4). Por debajo del mínimo siempre es 0: la API
 * la rechaza. Después suma por largo y por variedad de caracteres.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = 1;
  if (password.length >= 14) score += 1;
  if (variety >= 3) score += 1;
  if (password.length >= 16 && variety >= 3) score += 1;
  return Math.min(score, 4) as PasswordStrength;
}

export const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  0: 'Muy corta',
  1: 'Aceptable',
  2: 'Buena',
  3: 'Fuerte',
  4: 'Muy fuerte',
};

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-HN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
