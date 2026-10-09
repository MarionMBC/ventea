import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

const WORKFLOW = readFileSync(
  path.resolve(import.meta.dirname, '../../../.github/workflows/brand-app-ios.yml'),
  'utf8',
);

/** Los `run:` del workflow: nombre del paso → script (bloques `|` sin la indentación). */
function runScripts(yaml: string): Map<string, string> {
  const lines = yaml.split(/\r?\n/);
  const scripts = new Map<string, string>();
  let step = '';
  lines.forEach((line, index) => {
    const name = /^\s*- name: (.+)$/.exec(line);
    if (name) step = name[1]!.trim();
    const run = /^(\s*)(?:- )?run: ?(.*)$/.exec(line);
    if (!run) return;
    if (run[2] !== '|') {
      scripts.set(step, run[2]!);
      return;
    }
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== '' && next.search(/\S/) <= run[1]!.length) break;
      body.push(next);
    }
    const indent = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
    scripts.set(step, body.map((l) => l.slice(indent)).join('\n'));
  });
  return scripts;
}

const scripts = runScripts(WORKFLOW);

/** bash de verdad (Git Bash en Windows; nunca el de WSL de System32). */
const BASH =
  process.platform === 'win32'
    ? path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    : '/bin/bash';
const hasBash = existsSync(BASH);

const bash = (script: string, env: Record<string, string>) =>
  spawnSync(BASH, ['-c', script], { env: { ...process.env, ...env }, encoding: 'utf8' });

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('workflow de iOS: build_number', () => {
  test('declara el input y lo pasa por env del job', () => {
    expect(WORKFLOW).toMatch(/\n {6}build_number:\n(?: {8}.+\n)*? {8}type: string\n/);
    expect(WORKFLOW).toMatch(/\n {6}BUILD_NUMBER: \$\{\{ inputs\.build_number \}\}\n/);
  });

  test('ningún run: interpola expresiones (${{ }}): todo entra por env', () => {
    expect(scripts.size).toBeGreaterThan(5);
    for (const [step, script] of scripts) {
      expect(script, step).not.toContain('${{');
    }
  });

  test.skipIf(!hasBash)('valida: entero positivo sin ceros a la izquierda, o vacío', () => {
    const validate = scripts.get('Validar entradas');
    expect(validate).toBeDefined();
    const ok = (value: string) =>
      bash(validate!, { TENANT: 'carolina-hot-chicken', BUILD_NUMBER: value }).status === 0;
    for (const good of ['', '1', '5', '123456789']) expect(ok(good), good).toBe(true);
    for (const bad of ['0', '07', '-1', '1.5', 'abc', '1234567890', '5; rm -rf /', '$(id)', ' 5']) {
      expect(ok(bad), bad).toBe(false);
    }
  });

  test.skipIf(!hasBash)('el generador recibe --build-number solo si se pidió', () => {
    const generate = scripts.get('Generar la marca (config, íconos, Xcode, web, cap sync)');
    expect(generate).toBeDefined();
    const bin = mkdtempSync(path.join(tmpdir(), 'ventea-fake-npm-'));
    dirs.push(bin);
    const npm = path.join(bin, 'npm');
    writeFileSync(npm, '#!/bin/bash\nprintf "%s|" "$@"\n');
    chmodSync(npm, 0o755);
    const argsWith = (value: string) =>
      bash(`PATH="$FAKE_BIN:$PATH"\n${generate!}`, {
        FAKE_BIN: bin
          .replace(/\\/g, '/')
          .replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`),
        TENANT: 'carolina-hot-chicken',
        CONFIG_FROM: 'file',
        BUILD_NUMBER: value,
      }).stdout;
    expect(argsWith('7')).toBe(
      'run|brand:app|--|--tenant|carolina-hot-chicken|--platform|ios|--config-from|file|--build-number|7|',
    );
    expect(argsWith('')).toBe(
      'run|brand:app|--|--tenant|carolina-hot-chicken|--platform|ios|--config-from|file|',
    );
  });
});
