/**
 * Colour maths for the brand theme: hex parsing, WCAG 2.x relative luminance
 * and contrast ratio, and the two decisions the theme needs from them —
 * "white or dark text on this colour?" and "how much lighter must this colour
 * get to be readable as text on the app surfaces?".
 *
 * Pure functions, no DOM: the same code runs in tests and in the app. The
 * filled-surface rule (`filledTone`, `readableOn`) lives in `@ventea/shared`
 * so the dashboard's live preview paints exactly what the app paints.
 */
import {
  AA_TEXT,
  BLACK,
  FILL_MAX_DARKEN,
  FILL_STEP,
  filledTone,
  INK,
  mixRgb,
  parseHexRgb,
  readableOn,
  rgbContrast,
  rgbLuminance,
  rgbToHex,
  WHITE,
  type Rgb,
} from '@ventea/shared';

export type { Rgb };
export { AA_TEXT, BLACK, FILL_MAX_DARKEN, FILL_STEP, filledTone, INK, readableOn, WHITE };

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value.trim());

/** `#abc` / `abc` / `#aabbcc` → rgb; null for anything else. */
export const parseHex = (value: string): Rgb | null => parseHexRgb(value);

export const toHex = (rgb: Rgb): string => rgbToHex(rgb);

/** `"r, g, b"` for `rgba(var(--x-rgb), a)`. */
export const toRgbTriplet = ({ r, g, b }: Rgb): string => `${r}, ${g}, ${b}`;

/** WCAG relative luminance, 0 (black) … 1 (white). */
export const luminance = (rgb: Rgb): number => rgbLuminance(rgb);

/** WCAG contrast ratio between two colours, 1 … 21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => rgbContrast(a, b);

/** Linear blend: `amount` 0 keeps `from`, 1 gives `to`. */
export const mix = (from: Rgb, to: Rgb, amount: number): Rgb => mixRgb(from, to, amount);

const WHITE_RGB: Rgb = { r: 255, g: 255, b: 255 };
const BLACK_RGB: Rgb = { r: 0, g: 0, b: 0 };

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
