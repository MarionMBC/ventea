import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

import { gitCommit } from '../src/git';
import { run } from '../src/run';

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function repo(): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), 'ventea-git-'));
  dirs.push(dir);
  const git = (...args: string[]) => run('git', args, { cwd: dir, capture: true });
  await git('init', '-q');
  writeFileSync(path.join(dir, 'app.txt'), 'v1\n');
  await git('add', 'app.txt');
  await git('-c', 'user.name=t', '-c', 'user.email=t@x.test', 'commit', '-q', '-m', 'init');
  return dir;
}

describe('commit en metadata.json', () => {
  test('archivos sin versionar (.agent/ del harness) no lo marcan -dirty', async () => {
    const dir = await repo();
    writeFileSync(path.join(dir, 'untracked.txt'), 'x');
    expect(await gitCommit(dir)).toMatch(/^[0-9a-f]{7,}$/);
  });

  test('un archivo versionado modificado sí', async () => {
    const dir = await repo();
    writeFileSync(path.join(dir, 'app.txt'), 'v2\n');
    expect(await gitCommit(dir)).toMatch(/^[0-9a-f]{7,}-dirty$/);
  });

  test('fuera de un repo git: null', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ventea-nogit-'));
    dirs.push(dir);
    expect(await gitCommit(dir)).toBeNull();
  });
});
