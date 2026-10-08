import { describe, expect, it } from 'vitest';

import {
  formatUsd,
  isSlugFormatValid,
  passwordStrength,
  slugify,
  yearlySavingsCents,
} from './format';

describe('formatUsd', () => {
  it('sin decimales si el monto es entero, con dos si no', () => {
    expect(formatUsd(2500)).toBe('$25');
    expect(formatUsd(129000)).toBe('$1,290');
    expect(formatUsd(4917)).toBe('$49.17');
  });
});

describe('yearlySavingsCents', () => {
  it('es lo que se ahorra frente a pagar doce meses (dos meses gratis)', () => {
    expect(yearlySavingsCents({ priceMonthlyCents: 5900, priceYearlyCents: 59000 })).toBe(11800);
  });
});

describe('slugify', () => {
  it('quita acentos y eñes, deja minúsculas y guiones simples', () => {
    expect(slugify('Pollos Doña Ána')).toBe('pollos-dona-ana');
    expect(slugify('  Tacos & Más!!  ')).toBe('tacos-y-mas');
    expect(slugify('Café --- 24/7')).toBe('cafe-24-7');
  });

  it('corta a 63 caracteres sin dejar un guion al final', () => {
    const slug = slugify(`${'a'.repeat(62)} b`);
    expect(slug.length).toBeLessThanOrEqual(63);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('isSlugFormatValid', () => {
  it('acepta lo mismo que la API', () => {
    expect(isSlugFormatValid('pollos-juan')).toBe(true);
    expect(isSlugFormatValid('ab')).toBe(false);
    expect(isSlugFormatValid('pollos--juan')).toBe(false);
    expect(isSlugFormatValid('-pollos')).toBe(false);
    expect(isSlugFormatValid('Pollos')).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('0 por debajo de 10 caracteres; sube con largo y variedad', () => {
    expect(passwordStrength('corta')).toBe(0);
    expect(passwordStrength('abcdefghij')).toBe(1);
    expect(passwordStrength('abcdefghijklmn')).toBe(2);
    expect(passwordStrength('Abcdefgh1!')).toBe(2);
    expect(passwordStrength('Abcdefghijklmn1!')).toBe(4);
  });
});
