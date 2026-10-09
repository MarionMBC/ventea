import type { Rgb } from './color';
import {
  contrastRatio,
  parseHex,
  readableAsText,
  readableOn,
  shade,
  tint,
  toHex,
  toRgbTriplet,
  WHITE,
} from './color';

/**
 * Brand colours → CSS custom properties of the template.
 *
 * The surfaces of the template are neutral and dark (`theme/tokens.css`), so
 * every brand gets the same reading comfort; the brand shows on actions,
 * selections, badges and accents. For each brand colour two derived values
 * are computed, not hand-picked:
 *
 * - `--vt-on-*`: the text drawn on top of the colour (white or ink), the one
 *   with more contrast — always ≥ 4.5:1;
 * - `--vt-*-text`: the colour used as text on the dark surfaces, lightened
 *   just enough to reach 4.5:1 on every surface.
 */
export interface BrandColors {
  primary: string;
  secondary?: string | null;
  accent?: string | null;
}

/** Template surfaces text can sit on (tokens.css): page, cards, sheets. */
export const SURFACES: readonly string[] = ['#121010', '#1a1716', '#241f1d'];
const SURFACE_RGB = SURFACES.map((hex) => parseHex(hex) as Rgb);

/** Default primary when the brand sends nothing usable (the API's own default). */
export const FALLBACK_PRIMARY = '#E23B2E';

/** Accents need at least 3:1 on the page to work as a non-text cue. */
const MIN_ACCENT_CONTRAST = 3;

const pickAccent = (colors: BrandColors, primary: Rgb): Rgb => {
  const page = SURFACE_RGB[0] as Rgb;
  for (const candidate of [colors.accent, colors.secondary]) {
    const rgb = candidate ? parseHex(candidate) : null;
    if (rgb && contrastRatio(rgb, page) >= MIN_ACCENT_CONTRAST) return rgb;
  }
  /* A near-black secondary (common: "#1F1D1B") would vanish on the dark
     surfaces; the primary carries the accent role instead. */
  return primary;
};

export type ThemeVariables = Record<`--${string}`, string>;

export const deriveTheme = (colors: BrandColors): ThemeVariables => {
  const primary = parseHex(colors.primary) ?? (parseHex(FALLBACK_PRIMARY) as Rgb);
  const accent = pickAccent(colors, primary);
  const primaryText = readableAsText(primary, SURFACE_RGB);
  const accentText = readableAsText(accent, SURFACE_RGB);
  const onPrimary = readableOn(primary);
  const onAccent = readableOn(accent);
  /* Hover and pressed move AWAY from the text colour, so the label keeps (and
     gains) contrast: darker under white text, lighter under dark text. */
  const step = (color: Rgb, on: string, amount: number) =>
    on === WHITE ? shade(color, amount) : tint(color, amount);
  const onRgb = (hex: string) => toRgbTriplet(parseHex(hex) as Rgb);

  return {
    '--vt-brand-primary': toHex(primary),
    '--vt-brand-primary-rgb': toRgbTriplet(primary),
    /* -tint = hover, -shade = pressed (names kept from the design system). */
    '--vt-brand-primary-tint': toHex(step(primary, onPrimary, 0.08)),
    '--vt-brand-primary-shade': toHex(step(primary, onPrimary, 0.16)),
    '--vt-on-primary': onPrimary,
    '--vt-primary-text': toHex(primaryText),
    '--vt-brand-accent': toHex(accent),
    '--vt-brand-accent-rgb': toRgbTriplet(accent),
    '--vt-brand-accent-shade': toHex(step(accent, onAccent, 0.16)),
    '--vt-on-accent': onAccent,
    '--vt-accent-text': toHex(accentText),
    '--ion-color-primary-contrast-rgb': onRgb(onPrimary),
    '--ion-color-secondary-contrast-rgb': onRgb(onAccent),
  };
};

/** Writes the variables on `<html>`, where they override tokens.css. */
export const applyTheme = (
  variables: ThemeVariables,
  root: HTMLElement = document.documentElement,
) => {
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
};
