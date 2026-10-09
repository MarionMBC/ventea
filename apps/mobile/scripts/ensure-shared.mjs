/**
 * La app importa `@ventea/shared` ya compilado (`packages/shared/dist`). turbo, CI y Docker lo
 * compilan antes; un `npm run build|dev|test -w @ventea/mobile` suelto en un clon recién clonado
 * no. Este script (pre-hook de esos comandos) compila shared solo si falta `dist` o si `src` es
 * más nuevo: dentro de turbo es un no-op y no reescribe `dist` mientras otra app lo lee.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUTS = ['dist/index.js', 'dist/index.d.ts', 'dist/utils/tone.js', 'dist/utils/tone.d.ts'];

function newestMtime(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    const full = path.join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs;
    return Math.max(newest, mtime);
  }, 0);
}

/** ¿Hay que compilar `packages/shared`? Falta alguna salida o hay fuente más nueva que ellas. */
export function sharedBuildNeeded(sharedDir) {
  const outputs = OUTPUTS.map((file) => path.join(sharedDir, file));
  if (!outputs.every((file) => existsSync(file))) return true;
  const oldestOutput = Math.min(...outputs.map((file) => statSync(file).mtimeMs));
  return newestMtime(path.join(sharedDir, 'src')) > oldestOutput;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  if (sharedBuildNeeded(path.join(root, 'packages/shared'))) {
    console.log('[mobile] compilando @ventea/shared (falta dist o está desactualizado)');
    const result = spawnSync('npm', ['run', 'build', '-w', '@ventea/shared'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    process.exit(result.status ?? 1);
  }
}
