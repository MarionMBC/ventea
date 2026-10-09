import { run } from './run';

/**
 * Commit del código con el que se generó el build, para `metadata.json`: `<sha>` o
 * `<sha>-dirty` si hay cambios en archivos versionados. Los no versionados no cuentan
 * (`.agent/` del harness, `dist-apps/` locales): no cambian lo que se compila desde git.
 * `null` fuera de un repo git o sin git.
 */
export async function gitCommit(cwd: string): Promise<string | null> {
  try {
    const head = (
      await run('git', ['rev-parse', '--short', 'HEAD'], { cwd, capture: true })
    ).trim();
    const dirty = (
      await run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd, capture: true })
    ).trim();
    return dirty ? `${head}-dirty` : head;
  } catch {
    return null;
  }
}
