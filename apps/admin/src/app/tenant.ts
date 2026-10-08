import { useQuery } from '@tanstack/react-query';
import { publicTenantSchema, type PublicTenant } from '@ventea/shared';
import type { CSSProperties } from 'react';

import { useApi } from './services';

export const TENANT_QUERY_KEY = ['tenant'] as const;

/** Marca del panel (nombre, moneda, colores). Pública: no necesita sesión. */
export function useTenant() {
  const client = useApi();
  return useQuery({
    queryKey: TENANT_QUERY_KEY,
    queryFn: ({ signal }) =>
      client.request<PublicTenant>('/tenant', { auth: false, schema: publicTenantSchema, signal }),
    staleTime: 5 * 60_000,
  });
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const AA = 4.5;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa WCAG. */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contraste WCAG entre dos colores. */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(parseHex(a)), luminance(parseHex(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Variables CSS con el color de la marca y el del texto encima (blanco o casi negro).
 * Si ninguno de los dos llega a AA (4.5:1) — pasa con rojos medios como el de
 * Carolina — se oscurece el color de marca hasta que el blanco sí llegue. Un color
 * inválido se ignora y quedan los tokens neutros de `tokens.css`.
 */
export function brandStyle(tenant: PublicTenant | undefined): CSSProperties | undefined {
  const color = tenant?.branding.primaryColor;
  if (!color || !HEX_COLOR.test(color)) return undefined;

  for (const onBrand of ['#ffffff', '#111111']) {
    if (contrastRatio(color, onBrand) >= AA) {
      return { '--brand': color, '--on-brand': onBrand } as CSSProperties;
    }
  }
  let rgb = parseHex(color);
  for (let i = 0; i < 30 && contrastRatio(toHex(rgb), '#ffffff') < AA; i++) {
    rgb = rgb.map((c) => c * 0.94) as Rgb;
  }
  return { '--brand': toHex(rgb), '--on-brand': '#ffffff' } as CSSProperties;
}
