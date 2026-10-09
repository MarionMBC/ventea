import { spawn } from 'node:child_process';

/**
 * Variables que ningún proceso hijo hereda: vite, cap, gradle y git cargan plugins de
 * terceros, y el token de administrador de plataforma o la cuenta del dueño no son asunto
 * suyo. Si un hijo necesita una (keytool), se le pasa explícita en `env`.
 */
export const SECRET_ENV = [
  'VENTEA_PLATFORM_TOKEN',
  'VENTEA_OWNER_EMAIL',
  'VENTEA_OWNER_PASSWORD',
  'VENTEA_KS_PASS',
] as const;

/** Entorno de un hijo: el del proceso sin los secretos, más `extra` (`undefined` = quitar). */
export function childEnv(
  extra: Record<string, string | undefined> = {},
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of SECRET_ENV) delete env[key];
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

export interface RunOptions {
  cwd?: string;
  /** Variables extra para el hijo (`undefined` la quita); el resto sale de `childEnv()`. */
  env?: Record<string, string | undefined>;
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
      env: childEnv(options.env),
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
