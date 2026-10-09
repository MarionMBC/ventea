import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Captura stdout en vez de mostrarlo (para parsear la salida de aapt2/apksigner). */
  capture?: boolean;
  /** Solo para los `.bat`/`.cmd` de Windows (gradlew.bat); los argumentos son fijos. */
  shell?: boolean;
}

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly code: number | null,
    readonly stderr: string,
  ) {
    super(`${command} terminó con código ${code}${stderr ? `: ${stderr.trim().slice(-800)}` : ''}`);
    this.name = 'CommandError';
  }
}

/**
 * Corre un comando sin shell (salvo `.bat`). Los secretos nunca van en `args`: se pasan
 * por `env` (keytool `-storepass:env`) o por archivo, así no aparecen en la lista de
 * procesos ni en el mensaje de error.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: ['ignore', options.capture ? 'pipe' : 'inherit', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (!options.capture) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new CommandError(command, code, stderr));
    });
  });
}
