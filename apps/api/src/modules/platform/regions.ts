import { z } from 'zod';

/**
 * Regiones de la plataforma (lógica pura). La región la asigna el sistema por el país del
 * registro: el restaurante no la elige (ADR 0007). Hoy hay una sola, `hn-1` (la VPS
 * actual); con más, `REGIONS` las lista y el primer match por país gana.
 */

const regionSchema = z.object({
  code: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'code: minúsculas, dígitos y guiones'),
  /** Países ISO alfa-2 que atiende. `*` = cualquiera (región por defecto). */
  countries: z
    .array(z.string().regex(/^([A-Z]{2}|\*)$/, 'countries: ISO de 2 letras o "*"'))
    .min(1),
  /** Moneda por defecto de las marcas nuevas de la región. */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  /** Zona horaria por defecto de las marcas nuevas de la región. */
  timezone: z.string().min(1).default('UTC'),
});

const regionsSchema = z.array(regionSchema).min(1);

export type Region = z.infer<typeof regionSchema>;

export const DEFAULT_REGIONS: readonly Region[] = [
  { code: 'hn-1', countries: ['*'], currency: 'HNL', timezone: 'America/Tegucigalpa' },
];

/**
 * Lee `REGIONS` (JSON). Vacío o ausente: la región por defecto. Inválido: error, para que
 * la API no arranque con una config que mandaría marcas a una región que no existe.
 */
export function parseRegions(raw: string | undefined): Region[] {
  if (!raw || raw.trim() === '') return DEFAULT_REGIONS.map((region) => ({ ...region }));

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('REGIONS no es JSON válido');
  }
  const parsed = regionsSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`REGIONS inválido: ${issue?.path.join('.')} ${issue?.message}`);
  }
  const codes = parsed.data.map((region) => region.code);
  if (new Set(codes).size !== codes.length) throw new Error('REGIONS: códigos repetidos');
  return parsed.data;
}

/**
 * Región para un país: la primera que lo lista explícitamente; si ninguna, la primera con
 * `*`; si tampoco hay, la primera de la lista. Sin país (o uno desconocido como el `XX` de
 * Cloudflare), la de `*`.
 */
export function assignRegion(regions: readonly Region[], country?: string | null): Region {
  const code = country?.trim().toUpperCase();
  const explicit = code ? regions.find((region) => region.countries.includes(code)) : undefined;
  const fallback = regions.find((region) => region.countries.includes('*')) ?? regions[0];
  const region = explicit ?? fallback;
  if (!region) throw new Error('No hay regiones configuradas');
  return region;
}
