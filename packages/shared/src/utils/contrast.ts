/**
 * Contraste WCAG 2.x entre colores hex (`#rrggbb`). Lo usan la API (advertencias de Mi marca,
 * TASK-016) y el panel (vista previa) con la misma cuenta.
 */

/** Umbral AA para texto normal. */
export const WCAG_AA_NORMAL = 4.5;

const HEX_COLOR = /^#([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa (0 = negro, 1 = blanco). Lanza si el color no es `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const match = HEX_COLOR.exec(hex);
  if (!match) throw new Error(`Color inválido: ${hex}`);
  const n = Number.parseInt(match[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** Razón de contraste entre dos colores, de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contraste de texto blanco y negro sobre `background`, y si alguno llega a AA. */
export function textContrastOn(background: string): {
  white: number;
  black: number;
  passesAA: boolean;
} {
  const white = contrastRatio('#ffffff', background);
  const black = contrastRatio('#000000', background);
  return { white, black, passesAA: Math.max(white, black) >= WCAG_AA_NORMAL };
}
