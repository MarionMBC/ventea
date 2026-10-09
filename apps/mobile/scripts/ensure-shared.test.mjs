import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { sharedBuildNeeded } from './ensure-shared.mjs';

const OUTPUTS = ['dist/index.js', 'dist/index.d.ts', 'dist/utils/tone.js', 'dist/utils/tone.d.ts'];
const dirs = [];

function fakeShared({ withDist, srcAt = 1_000, distAt = 2_000 }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ventea-shared-'));
  dirs.push(dir);
  const write = (file, at) => {
    const full = path.join(dir, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, '');
    utimesSync(full, at, at);
  };
  write('src/index.ts', srcAt);
  write('src/utils/tone.ts', srcAt);
  if (withDist) for (const file of OUTPUTS) write(file, distAt);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('ensure-shared (build de mobile en un clon limpio)', () => {
  it('clon limpio, sin dist: compila shared', () => {
    expect(sharedBuildNeeded(fakeShared({ withDist: false }))).toBe(true);
  });

  it('dist al día (turbo ya lo compiló): no hace nada', () => {
    expect(sharedBuildNeeded(fakeShared({ withDist: true }))).toBe(false);
  });

  it('fuente más nueva que dist: recompila', () => {
    expect(sharedBuildNeeded(fakeShared({ withDist: true, srcAt: 3_000 }))).toBe(true);
  });

  it('corre antes de build, dev, test y typecheck de mobile', () => {
    const { scripts } = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
    );
    for (const hook of ['prebuild', 'predev', 'pretest', 'pretypecheck']) {
      expect(scripts[hook]).toBe('node scripts/ensure-shared.mjs');
    }
  });
});
