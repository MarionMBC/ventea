/**
 * Colour maths for the brand theme: hex parsing, WCAG 2.x relative luminance
 * and contrast ratio, and the two decisions the theme needs from them —
 * "white or dark text on this colour?" and "how much lighter must this colour
 * get to be readable as text on the app surfaces?".
 *
 * Pure functions, no DOM: the same code runs in tests and in the app.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** WCAG AA for normal text. */
export const AA_TEXT = 4.5;

export const WHITE = '#ffffff';
/** The template's near-black text; same as `--vt-text-inverse`. */
export const INK = '#120f0e';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value.trim());

/** `#abc` / `abc` / `#aabbcc` → rgb; null for anything else. */
export const parseHex = (value: string): Rgb | null => {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((char) => char + char).join('');
  const int = Number.parseInt(hex, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

const channel = (value: number) => value.toString(16).padStart(2, '0');

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${channel(Math.round(r))}${channel(Math.round(g))}${channel(Math.round(b))}`;

/** `"r, g, b"` for `rgba(var(--x-rgb), a)`. */
export const toRgbTriplet = ({ r, g, b }: Rgb): string => `${r}, ${g}, ${b}`;

const linear = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) … 1 (white). */
export const luminance = ({ r, g, b }: Rgb): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG contrast ratio between two colours, 1 … 21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

/** Linear blend: `amount` 0 keeps `from`, 1 gives `to`. */
export const mix = (from: Rgb, to: Rgb, amount: number): Rgb => ({
  r: Math.round(from.r + (to.r - from.r) * amount),
  g: Math.round(from.g + (to.g - from.g) * amount),
  b: Math.round(from.b + (to.b - from.b) * amount),
});

const WHITE_RGB: Rgb = { r: 255, g: 255, b: 255 };
const INK_RGB = parseHex(INK) as Rgb;
const BLACK_RGB: Rgb = { r: 0, g: 0, b: 0 };

export const BLACK = '#000000';

/**
 * Text colour for content drawn ON `background`: white or the template ink,
 * whichever contrasts more — when that reaches AA. Mid-tone colours (a bright
 * red like #E23B2E) reach AA with neither; then pure black, which together
 * with white always gives at least ~4.58:1 for one of the two.
 */
export const readableOn = (background: Rgb): string => {
  const white = contrastRatio(WHITE_RGB, background);
  const ink = contrastRatio(INK_RGB, background);
  const best = white >= ink ? WHITE : INK;
  if (Math.max(white, ink) >= AA_TEXT) return best;
  return white >= contrastRatio(BLACK_RGB, background) ? WHITE : BLACK;
};

/** Darkening steps tried for a filled surface: 2% each, up to 20%. */
export const FILL_STEP = 0.02;
export const FILL_MAX_DARKEN = 0.2;

/**
 * Tone for a FILLED surface (button, badge, chip) and the text on it. Brands
 * expect white on their colour, so the colour is darkened towards black in 2%
 * steps until white reaches AA — a bright red #E23B2E becomes #D9392C (−4%),
 * indistinguishable at a glance. If AA needs more than 20% the brand would
 * visibly change (a yellow would turn mustard): then the original colour
 * stays and the text goes dark instead.
 */
export const filledTone = (color: Rgb): { fill: Rgb; on: string } => {
  const steps = Math.round(FILL_MAX_DARKEN / FILL_STEP);
  for (let step = 0; step <= steps; step += 1) {
    const fill = mix(color, BLACK_RGB, step * FILL_STEP);
    if (contrastRatio(WHITE_RGB, fill) >= AA_TEXT) return { fill, on: WHITE };
  }
  return { fill: color, on: readableOn(color) };
};

/**
 * The brand colour used AS text or as a thin line on dark `surfaces`: lightened
 * in small steps (towards white) until it reaches `target` against every
 * surface. A brand colour that already passes is returned untouched, so the
 * hue stays recognisable whenever it can.
 */
export const readableAsText = (color: Rgb, surfaces: Rgb[], target = AA_TEXT): Rgb => {
  const passes = (candidate: Rgb) =>
    surfaces.every((surface) => contrastRatio(candidate, surface) >= target);
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, WHITE_RGB, step / 20);
    if (passes(candidate)) return candidate;
  }
  return WHITE_RGB;
};

/** Darker step for pressed states. */
export const shade = (color: Rgb, amount = 0.12): Rgb => mix(color, BLACK_RGB, amount);
/** Lighter step for hover states. */
export const tint = (color: Rgb, amount = 0.1): Rgb => mix(color, WHITE_RGB, amount);
