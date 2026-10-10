/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * Regla de layout del panel (`apps/admin/LAYOUT.md`, TASK-020), comprobada sobre las hojas de
 * estilo. La verificación en el navegador (doble scroll, desbordes) es `npm run test:layout`.
 */
// Se leen del disco: Vitest no procesa CSS (un `?raw` llega vacío).
const dir = path.dirname(fileURLToPath(import.meta.url));
const sheets = readdirSync(dir)
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, css: readFileSync(path.join(dir, file), 'utf8') }));

/** Reglas `selector { cuerpo }` de primer nivel o dentro de un @media (sin anidar más). */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(re)) {
    out.push({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' });
  }
  return out;
}

describe('regla de layout', () => {
  it('cada 100vh va seguido de su versión 100dvh (barra de direcciones del móvil)', () => {
    const missing: string[] = [];
    for (const { file, css } of sheets) {
      const lines = css.split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('100vh')) return;
        const expected = line.replace(/100vh/g, '100dvh').trim();
        if (lines[i + 1]?.trim() !== expected) missing.push(`${file}:${i + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });

  it('el área principal no tiene alto fijo ni scroll propio salvo en el tablero de pedidos', () => {
    const offenders = sheets.flatMap(({ file, css }) =>
      rules(css)
        .filter(({ selector, body }) =>
          selector
            .split(',')
            .some(
              (part) =>
                /\.app__main\s*$/.test(part.trim()) &&
                !part.includes(':has(.orders--board)') &&
                /(^|;|\s)(height|overflow(-y)?)\s*:/.test(body),
            ),
        )
        .map(({ selector }) => `${file}: ${selector}`),
    );
    expect(offenders).toEqual([]);
  });

  it('las reglas sobre los hijos del área principal solo valen en el tablero (scope con :has)', () => {
    const offenders = sheets.flatMap(({ file, css }) =>
      rules(css)
        .filter(({ selector }) =>
          selector
            .split(',')
            .some((part) => /\.app__main\s*>/.test(part) && !part.includes(':has(.orders--board)')),
        )
        .map(({ selector }) => `${file}: ${selector}`),
    );
    expect(offenders).toEqual([]);
  });

  it('el área principal del tablero contiene a sus hijos absolutos (position: relative)', () => {
    const board = sheets
      .flatMap(({ css }) => rules(css))
      .filter(({ selector }) => selector.includes(':has(.orders--board) > .app__main'));
    expect(board.length).toBeGreaterThan(0);
    expect(board.some(({ body }) => /position:\s*relative/.test(body))).toBe(true);
  });
});
