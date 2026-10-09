import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { run } from './run';

/** Build de Android con gradle y verificación del binario con las build-tools del SDK. */

export interface Artifact {
  file: string;
  sha256: string;
  bytes: number;
}

export interface Badging {
  packageName: string;
  versionCode: number;
  versionName: string;
  label: string | null;
}

export function gradleTasks(release: boolean): string[] {
  return release ? ['bundleRelease', 'assembleRelease'] : ['assembleDebug'];
}

export async function gradleBuild(
  androidDir: string,
  release: boolean,
  env: Record<string, string>,
): Promise<void> {
  const windows = process.platform === 'win32';
  // Ruta absoluta (cmd no siempre busca en el cwd); entre comillas por si lleva espacios.
  const gradlew = windows ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew';
  await run(gradlew, [...gradleTasks(release), '--no-daemon', '--console=plain'], {
    cwd: androidDir,
    env: { ...process.env, ...env },
    // gradlew.bat solo corre con shell; los argumentos son fijos (sin entrada del usuario).
    shell: windows,
  });
}

export function builtOutputs(
  androidDir: string,
  release: boolean,
): { apk: string; aab: string | null } {
  const outputs = path.join(androidDir, 'app', 'build', 'outputs');
  const variant = release ? 'release' : 'debug';
  const apk = path.join(outputs, 'apk', variant, `app-${variant}.apk`);
  const aab = release ? path.join(outputs, 'bundle', 'release', 'app-release.aab') : null;
  if (!existsSync(apk)) throw new Error(`gradle no dejó ${apk}`);
  if (aab && !existsSync(aab)) throw new Error(`gradle no dejó ${aab}`);
  return { apk, aab };
}

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function copyArtifact(from: string, outDir: string, name: string): Artifact {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, name);
  copyFileSync(from, file);
  return { file, sha256: sha256File(file), bytes: statSync(file).size };
}

/** Build-tools más nuevas instaladas en `ANDROID_HOME`/`ANDROID_SDK_ROOT`. */
export function buildToolsDir(env: NodeJS.ProcessEnv = process.env): string {
  const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Falta ANDROID_HOME (SDK de Android)');
  const root = path.join(sdk, 'build-tools');
  const versions = readdirSync(root)
    .filter((name) => /^\d+\.\d+\.\d+/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const latest = versions.at(-1);
  if (!latest) throw new Error(`No hay build-tools en ${root}`);
  return path.join(root, latest);
}

/** `aapt2 dump badging` → paquete, versión y nombre visible. */
export function parseBadging(output: string): Badging {
  const pkg = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m.exec(output);
  if (!pkg) throw new Error('aapt2: no se encontró la línea package:');
  const label = /^application-label:'([^']*)'/m.exec(output);
  return {
    packageName: pkg[1]!,
    versionCode: Number(pkg[2]),
    versionName: pkg[3]!,
    label: label ? label[1]! : null,
  };
}

/**
 * `apksigner verify --print-certs` → SHA-256 del certificado. Según la versión imprime
 * `Signer #1 certificate …` o `V3.0 Signer: certificate …`; tiene que haber uno solo.
 */
export function parseSignerSha256(output: string): string {
  const digests = new Set(
    [...output.matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/gi)].map((m) =>
      m[1]!.toLowerCase(),
    ),
  );
  if (digests.size === 0) throw new Error('apksigner: no se encontró el SHA-256 del certificado');
  if (digests.size > 1) throw new Error('apksigner: el APK tiene más de un certificado');
  return [...digests][0]!;
}

/** `keytool -printcert -jarfile` (AAB) → SHA-256 en hex sin `:`. */
export function parseKeytoolSha256(output: string): string {
  const match = /SHA256:\s*([0-9A-F:]{95})/i.exec(output);
  if (!match) throw new Error('keytool: no se encontró el SHA-256 del certificado');
  return match[1]!.replace(/:/g, '').toLowerCase();
}

export async function badging(apk: string, tools = buildToolsDir()): Promise<Badging> {
  const aapt2 = path.join(tools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
  return parseBadging(await run(aapt2, ['dump', 'badging', apk], { capture: true }));
}

/** apksigner vía `java -jar` (en Windows el `.bat` necesitaría shell). */
export async function apkSignerSha256(apk: string, tools = buildToolsDir()): Promise<string> {
  const jar = path.join(tools, 'lib', 'apksigner.jar');
  const output = await run('java', ['-jar', jar, 'verify', '--print-certs', apk], {
    capture: true,
  });
  return parseSignerSha256(output);
}

export async function aabSignerSha256(aab: string): Promise<string> {
  return parseKeytoolSha256(
    await run('keytool', ['-printcert', '-jarfile', aab], { capture: true }),
  );
}
