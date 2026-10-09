/**
 * Tono de las superficies RELLENAS de la marca (botones, insignias, chips) y el texto encima.
 * Una sola regla para la app (TASK-018) y la vista previa del panel (TASK-017): si difieren, la
 * vista previa le muestra al dueño otra cosa que lo que ven sus clientes.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** WCAG AA para texto normal. */
export const AA_TEXT = 4.5;

export const WHITE = '#ffffff';
export const BLACK = '#000000';
/** Casi negro del tema de la app (`--vt-text-inverse`). */
export const INK = '#120f0e';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `abc` / `#aabbcc` → rgb; `null` si no es un hex. */
export function parseHexRgb(value: string): Rgb | null {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((char) => char + char).join('');
  const int = Number.parseInt(hex, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0');

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const linear = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa WCAG, 0 (negro) … 1 (blanco). */
export function rgbLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Contraste WCAG entre dos colores, 1 … 21. */
export function rgbContrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [rgbLuminance(a), rgbLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** Mezcla lineal: `amount` 0 deja `from`, 1 da `to`. */
export function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  };
}

const WHITE_RGB: Rgb = { r: 255, g: 255, b: 255 };
const BLACK_RGB: Rgb = { r: 0, g: 0, b: 0 };
const INK_RGB: Rgb = { r: 0x12, g: 0x0f, b: 0x0e };

/**
 * Texto sobre `background`: blanco o la tinta del tema, el que contraste más, si llega a AA.
 * Los tonos medios (un rojo como #E23B2E) no llegan con ninguno: entonces negro puro, que junto
 * con el blanco siempre da al menos ~4.58:1 para uno de los dos.
 */
export function readableOn(background: Rgb): string {
  const white = rgbContrast(WHITE_RGB, background);
  const ink = rgbContrast(INK_RGB, background);
  const best = white >= ink ? WHITE : INK;
  if (Math.max(white, ink) >= AA_TEXT) return best;
  return white >= rgbContrast(BLACK_RGB, background) ? WHITE : BLACK;
}

/** Pasos de oscurecimiento para una superficie rellena: de a 2 %, hasta 20 %. */
export const FILL_STEP = 0.02;
export const FILL_MAX_DARKEN = 0.2;

/**
 * Tono de una superficie RELLENA y su texto. Las marcas esperan texto blanco sobre su color: se
 * oscurece hacia negro de a 2 % hasta que el blanco llegue a AA (#E23B2E → #D9392C, −4 %). Si
 * hace falta más de 20 % la marca cambiaría a la vista (un amarillo se volvería mostaza): queda
 * el color original y el texto pasa a oscuro.
 */
export function filledTone(color: Rgb): { fill: Rgb; on: string } {
  const steps = Math.round(FILL_MAX_DARKEN / FILL_STEP);
  for (let step = 0; step <= steps; step += 1) {
    const fill = mixRgb(color, BLACK_RGB, step * FILL_STEP);
    if (rgbContrast(WHITE_RGB, fill) >= AA_TEXT) return { fill, on: WHITE };
  }
  return { fill: color, on: readableOn(color) };
}

/** `filledTone` con hex: `#e23b2e` → `{fill: '#d9392c', on: '#ffffff'}`; `null` si no es un hex. */
export function filledToneHex(color: string): { fill: string; on: string } | null {
  const rgb = parseHexRgb(color);
  if (!rgb) return null;
  const { fill, on } = filledTone(rgb);
  return { fill: rgbToHex(fill), on };
}
