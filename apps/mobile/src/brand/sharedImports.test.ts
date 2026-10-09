import { describe, expect, it } from 'vitest';

/** Todo el código de la app (sin tests), como texto. */
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('imports de @ventea/shared', () => {
  // El barrel arrastra todos los contratos zod al bundle del menú público (+29 KB gzip):
  // la app importa solo subpaths (`@ventea/shared/tone`).
  it('la app no importa el barrel', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources)
      .filter(([, text]) => /from\s+['"]@ventea\/shared['"]/.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
