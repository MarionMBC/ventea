import { describe, expect, test } from 'vitest';
import {
  AA_TEXT,
  BLACK,
  contrastRatio,
  INK,
  parseHex,
  readableAsText,
  readableOn,
  toHex,
  WHITE,
} from './color';
import type { Rgb } from './color';
import { deriveTheme, SURFACES } from './theme';

const rgb = (hex: string) => parseHex(hex) as Rgb;
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b));

describe('colour maths', () => {
  test('parses 3- and 6-digit hex, rejects the rest', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('2E6FE2')).toEqual({ r: 46, g: 111, b: 226 });
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
  });

  test('WCAG contrast matches the reference values', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    /* WebAIM: #767676 on white is the classic 4.54:1. */
    expect(ratio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  test('text on a colour is white or ink, whichever passes AA', () => {
    expect(readableOn(rgb('#2E6FE2'))).toBe(WHITE);
    expect(readableOn(rgb('#FDB913'))).toBe(INK);
    /* Neither white (4.0:1) nor ink (4.45:1) passes on this red: black does. */
    expect(readableOn(rgb('#E23B2E'))).toBe(BLACK);
    for (const hex of [
      '#000000',
      '#ffffff',
      '#777777',
      '#808080',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#FDB913',
      '#E23B2E',
      '#D81E20',
    ]) {
      expect(ratio(readableOn(rgb(hex)), hex)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  test('a colour used as text is lightened only as much as AA needs', () => {
    const surfaces = SURFACES.map(rgb);
    const yellow = rgb('#FDB913');
    expect(toHex(readableAsText(yellow, surfaces))).toBe('#fdb913');
    const blue = readableAsText(rgb('#2E6FE2'), surfaces);
    for (const surface of SURFACES)
      expect(contrastRatio(blue, rgb(surface))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(toHex(blue)).not.toBe('#ffffff');
  });
});

describe('deriveTheme', () => {
  const brands = [
    { primary: '#E23B2E', secondary: '#1F1D1B', accent: '#FDB913' },
    { primary: '#2E6FE2', secondary: '#1F1D1B', accent: null },
    { primary: '#FFFF00', secondary: null },
    { primary: '#101010', secondary: '#FAFAFA' },
    { primary: '#7F7F7F' },
  ];

  test.each(brands)('every text pair passes AA for %o', (colors) => {
    const theme = deriveTheme(colors);
    const primary = theme['--vt-brand-primary'] as string;
    const accent = theme['--vt-brand-accent'] as string;
    expect(ratio(theme['--vt-on-primary'] as string, primary)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(theme['--vt-on-accent'] as string, accent)).toBeGreaterThanOrEqual(AA_TEXT);
    /* Hover and pressed states keep the label readable too. */
    for (const state of ['--vt-brand-primary-tint', '--vt-brand-primary-shade'] as const) {
      expect(
        ratio(theme['--vt-on-primary'] as string, theme[state] as string),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(
      ratio(theme['--vt-on-accent'] as string, theme['--vt-brand-accent-shade'] as string),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    for (const surface of SURFACES) {
      expect(ratio(theme['--vt-primary-text'] as string, surface)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(ratio(theme['--vt-accent-text'] as string, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  test('two brands get different themes', () => {
    expect(deriveTheme(brands[0]!)['--vt-brand-primary']).not.toBe(
      deriveTheme(brands[1]!)['--vt-brand-primary'],
    );
  });

  test('accent: explicit accent, else a visible secondary, else the primary', () => {
    expect(deriveTheme({ primary: '#E23B2E', accent: '#FDB913' })['--vt-brand-accent']).toBe(
      '#fdb913',
    );
    expect(deriveTheme({ primary: '#E23B2E', secondary: '#22AA55' })['--vt-brand-accent']).toBe(
      '#22aa55',
    );
    /* A near-black secondary would vanish on the dark surfaces. */
    expect(deriveTheme({ primary: '#2E6FE2', secondary: '#1F1D1B' })['--vt-brand-accent']).toBe(
      '#2e6fe2',
    );
  });

  test('an invalid primary falls back instead of breaking the theme', () => {
    expect(deriveTheme({ primary: 'not-a-colour' })['--vt-brand-primary']).toBe('#e23b2e');
  });

  test('rgb triplets feed rgba() in the stylesheets', () => {
    expect(deriveTheme({ primary: '#2E6FE2' })['--vt-brand-primary-rgb']).toBe('46, 111, 226');
  });
});
