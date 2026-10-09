import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AppStatus, BuildConfig } from '@ventea/shared';

import {
  aabSignerSha256,
  apkSignerSha256,
  badging,
  builtOutputs,
  copyArtifact,
  gradleBuild,
  type Artifact,
} from './android';
import { APP_USAGE, parseAppArgs, UsageError, type AppArgs } from './args';
import {
  brandFromBuildConfig,
  findBrandFile,
  lastLocalBuildNumber,
  mobileVersion,
  readBrandFile,
  resolveBuildNumber,
  resolveVersion,
  type BrandConfig,
} from './config';
import {
  androidSplashFiles,
  brandMasters,
  writeAndroidIcons,
  writeIosAssets,
  writeSplashes,
} from './icons';
import { ensureOwnKeystore, externalKeystore, signingEnv, type Signing } from './keystore';
import { log } from './log';
import {
  readSigningFromEnv,
  setAndroidStrings,
  setApplicationId,
  setGradleVersions,
  setInfoPlistDisplayName,
  setLauncherBackground,
  setPbxproj,
} from './native';
import {
  brandPaths,
  brandSecretsDir,
  DIST_APPS_DIR,
  keystoreDir,
  MOBILE_DIR,
  REPO_ROOT,
  userPath,
  type BrandPaths,
} from './paths';
import { PlatformApi } from './platform-api';
import { run } from './run';
import { storeListing, type ListingExtras } from './store-listing';
import { editFile, prepareWorkDir, writeJson } from './workdir';

/**
 * `npm run brand:app -- --tenant <slug> [--platform android|ios] [--release]`
 *
 * 1. Configuración de la marca (plataforma o archivo) → `brand.config.json`.
 * 2. Copia de trabajo `dist-apps/.work/<slug>/` con íconos, splash, ids y versión.
 * 3. Reserva el build number en la plataforma.
 * 4. Web (`vite build`) → `cap sync` → gradle (AAB + APK firmados con el keystore de la marca).
 * 5. Verifica el binario (aapt2 + apksigner) y deja todo en `dist-apps/<slug>/<version>+<build>/`.
 * 6. Marca la app como `building` en la plataforma si estaba recién pedida.
 */

const UNSTARTED: AppStatus[] = ['not_requested', 'requested'];

interface Resolved {
  brand: BrandConfig;
  buildConfig: BuildConfig | null;
  api: PlatformApi | null;
  version: string;
  buildNumber: number;
  pushEnabled: boolean;
}

function withLegacyPrefix(brand: BrandConfig, prefix: string | null): BrandConfig {
  if (!prefix) return brand;
  if (!/^[a-z][a-z0-9_-]{0,15}\.$/.test(prefix)) {
    throw new UsageError(`--legacy-storage-prefix inválido: "${prefix}" (p. ej. chc.)`);
  }
  return { ...brand, legacyStoragePrefix: prefix };
}

async function resolveConfig(args: AppArgs): Promise<Resolved> {
  const googleServices = path.join(brandSecretsDir(args.tenant), 'google-services.json');
  // iOS: falta sumar Firebase Messaging al proyecto de Xcode (white-label.md, Push).
  const pushEnabled = args.platform === 'android' && existsSync(googleServices);
  const slugDist = path.join(DIST_APPS_DIR, args.tenant);

  if (args.configFrom === 'api') {
    const api = new PlatformApi(args.apiUrl!, process.env.VENTEA_PLATFORM_TOKEN ?? '');
    const buildConfig = await api.buildConfig(args.tenant);
    const brand = withLegacyPrefix(
      brandFromBuildConfig(buildConfig, { appApiUrl: args.appApiUrl, pushEnabled }),
      args.legacyStoragePrefix,
    );
    return {
      brand,
      buildConfig,
      api,
      pushEnabled,
      version: resolveVersion({
        flag: args.version,
        platform: buildConfig.app.version,
        fallback: mobileVersion(MOBILE_DIR),
      }),
      buildNumber: resolveBuildNumber({
        flag: args.buildNumber,
        platform: buildConfig.app.buildNumber,
        localLast: lastLocalBuildNumber(slugDist),
      }),
    };
  }

  const file = args.configFile
    ? userPath(args.configFile)
    : findBrandFile(path.join(MOBILE_DIR, 'brands'), args.tenant);
  const read = readBrandFile(file);
  if (read.brand.tenantSlug !== args.tenant) {
    throw new UsageError(`${file} es de "${read.brand.tenantSlug}", no de "${args.tenant}"`);
  }
  let brand = withLegacyPrefix(read.brand, args.legacyStoragePrefix);
  if (args.appApiUrl) brand = { ...brand, apiUrl: new URL(args.appApiUrl).origin };
  log.info(`configuración: ${path.relative(REPO_ROOT, file)}`);
  return {
    brand: { ...brand, push: { enabled: pushEnabled } },
    buildConfig: null,
    api: null,
    pushEnabled,
    version: resolveVersion({
      flag: args.version,
      platform: read.version,
      fallback: mobileVersion(MOBILE_DIR),
    }),
    buildNumber: resolveBuildNumber({
      flag: args.buildNumber,
      platform: null,
      fileMinimum: read.buildNumber,
      localLast: lastLocalBuildNumber(slugDist),
    }),
  };
}

async function brandNative(args: AppArgs, resolved: Resolved, paths: BrandPaths): Promise<Buffer> {
  const { brand, version, buildNumber } = resolved;
  const masters = await brandMasters(
    brand,
    resolved.buildConfig?.branding.iconUrl ?? brand.iconUrl,
  );
  if (args.platform === 'android') {
    const app = path.join(paths.android, 'app');
    const res = path.join(app, 'src', 'main', 'res');
    await writeAndroidIcons(res, masters);
    await writeSplashes(await androidSplashFiles(res), masters);
    editFile(path.join(res, 'values', 'ic_launcher_background.xml'), (xml) =>
      setLauncherBackground(xml, masters.background),
    );
    editFile(path.join(res, 'values', 'strings.xml'), (xml) =>
      setAndroidStrings(xml, brand.appName, brand.bundleId),
    );
    editFile(path.join(app, 'build.gradle'), (gradle) =>
      readSigningFromEnv(setApplicationId(gradle, brand.bundleId)),
    );
    editFile(path.join(paths.android, 'variables.gradle'), (gradle) =>
      setGradleVersions(gradle, buildNumber, version),
    );
    if (resolved.pushEnabled) {
      copyFileSync(
        path.join(brandSecretsDir(brand.tenantSlug), 'google-services.json'),
        path.join(app, 'google-services.json'),
      );
    }
  } else {
    const app = path.join(paths.ios, 'App');
    await writeIosAssets(path.join(app, 'App', 'Assets.xcassets'), masters);
    editFile(path.join(app, 'App.xcodeproj', 'project.pbxproj'), (pbx) =>
      setPbxproj(pbx, brand.bundleId, version, buildNumber),
    );
    editFile(path.join(app, 'App', 'Info.plist'), (plist) =>
      setInfoPlistDisplayName(plist, brand.appName),
    );
  }
  return masters.full;
}

/** Bundle web de la marca, sin `VITE_API_URL` de desarrollo que se cuele al binario. */
async function buildWeb(paths: BrandPaths): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, VENTEA_BRAND_FILE: paths.brandFile };
  delete env.VITE_API_URL;
  delete env.VITE_DEFAULT_TENANT_SLUG;
  await run(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--outDir',
      paths.www,
      '--emptyOutDir',
      '--logLevel',
      'error',
    ],
    { cwd: MOBILE_DIR, env },
  );
}

async function capSync(paths: BrandPaths, platform: string): Promise<void> {
  await run(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'),
      'sync',
      platform,
    ],
    { cwd: paths.work },
  );
}

async function gitCommit(): Promise<string | null> {
  try {
    const head = (
      await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, capture: true })
    ).trim();
    const dirty = (
      await run('git', ['status', '--porcelain'], { cwd: REPO_ROOT, capture: true })
    ).trim();
    return dirty ? `${head}-dirty` : head;
  } catch {
    return null;
  }
}

function listingExtras(buildConfig: BuildConfig | null): ListingExtras {
  return {
    storeShortDescription: buildConfig?.branding.storeShortDescription ?? null,
    supportEmail: buildConfig?.branding.supportEmail ?? null,
    websiteUrl: buildConfig?.branding.websiteUrl ?? null,
    publisher: buildConfig?.app.publisher ?? null,
  };
}

async function signingFor(args: AppArgs, brand: BrandConfig): Promise<Signing | null> {
  if (!args.release) return null;
  if (args.keystoreProps) {
    return externalKeystore({
      keystore: args.keystore ? userPath(args.keystore) : null,
      properties: userPath(args.keystoreProps),
    });
  }
  return ensureOwnKeystore({ dir: keystoreDir(), slug: brand.tenantSlug, appName: brand.appName });
}

async function main(): Promise<void> {
  const args = parseAppArgs(process.argv.slice(2));

  log.step(`Configuración de ${args.tenant} (${args.configFrom})`);
  const resolved = await resolveConfig(args);
  const { brand, version, buildNumber, api, buildConfig } = resolved;
  const paths = brandPaths(DIST_APPS_DIR, args.tenant, version, buildNumber);
  log.ok(`${brand.appName} · ${brand.bundleId} · ${version} (${buildNumber}) · ${args.platform}`);
  if (!args.prepareOnly && args.platform === 'android' && existsSync(paths.out)) {
    throw new UsageError(`Ya existe ${paths.out}: usar otro --build-number`);
  }

  log.step('Copia de trabajo, íconos y proyecto nativo');
  prepareWorkDir({ mobileDir: MOBILE_DIR, paths, platform: args.platform, brand });
  const icon = await brandNative(args, resolved, paths);
  writeFileSync(path.join(paths.work, 'icon-1024.png'), icon);
  log.ok(path.relative(REPO_ROOT, paths.work));

  // La firma se resuelve antes de reservar nada: un keystore que falta frena acá.
  const signing =
    args.prepareOnly || args.platform !== 'android' ? null : await signingFor(args, brand);
  if (signing?.created) {
    log.warn(`Keystore NUEVO en ${signing.keystore} (+ .properties). RESPALDAR AMBOS YA:`);
    log.warn('sin ellos no se puede volver a actualizar la app publicada.');
  }

  if (api && !args.prepareOnly) {
    log.step('Reserva de versión en la plataforma');
    await api.updateApp(args.tenant, { version, buildNumber });
    log.ok(`buildNumber ${buildNumber} reservado`);
  }

  log.step('Build web');
  await buildWeb(paths);
  log.step(`cap sync ${args.platform}`);
  await capSync(paths, args.platform);

  const listing = storeListing(brand, listingExtras(buildConfig), version, buildNumber);
  if (args.prepareOnly || args.platform === 'ios') {
    writeFileSync(path.join(paths.work, 'store-listing.md'), listing);
    log.step('Listo para compilar');
    if (args.platform === 'ios') {
      log.info(
        `Xcode: ${path.join(paths.ios, 'App', 'App.xcodeproj')} (en una Mac o el workflow brand-app-ios)`,
      );
    } else {
      log.info(`gradle: ${paths.android}`);
    }
    return;
  }

  log.step(`gradle ${args.release ? 'bundleRelease + assembleRelease' : 'assembleDebug'}`);
  // Vacías a propósito: sin firma no se hereda un keystore del entorno de quien corre esto.
  const gradleEnv = signing
    ? signingEnv(signing)
    : { VENTEA_KEYSTORE_FILE: '', VENTEA_KEYSTORE_PROPERTIES: '' };
  await gradleBuild(paths.android, args.release, gradleEnv);

  log.step('Artefactos y verificación');
  const outputs = builtOutputs(paths.android, args.release);
  const base = `${args.tenant}-${version}+${buildNumber}`;
  const artifacts: Artifact[] = [
    copyArtifact(outputs.apk, paths.out, `${base}${args.release ? '' : '-debug'}.apk`),
  ];
  if (outputs.aab) artifacts.push(copyArtifact(outputs.aab, paths.out, `${base}.aab`));

  const apk = artifacts[0]!.file;
  const info = await badging(apk);
  const expected = {
    packageName: brand.bundleId,
    versionCode: buildNumber,
    versionName: version,
    label: brand.appName,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (info[key as keyof typeof info] !== value) {
      throw new Error(
        `aapt2: ${key} es ${String(info[key as keyof typeof info])}, se esperaba ${value}`,
      );
    }
  }
  const certSha256 = await apkSignerSha256(apk);
  if (outputs.aab) {
    const aabSha = await aabSignerSha256(artifacts[1]!.file);
    if (aabSha !== certSha256)
      throw new Error('El AAB y el APK no están firmados con el mismo certificado');
  }
  log.ok(
    `aapt2: ${info.packageName} · ${info.versionName} (${info.versionCode}) · "${info.label}"`,
  );
  log.ok(`apksigner: certificado SHA-256 ${certSha256}`);

  copyFileSync(path.join(paths.work, 'icon-1024.png'), path.join(paths.out, 'icon-1024.png'));
  writeFileSync(path.join(paths.out, 'store-listing.md'), listing);
  writeJson(path.join(paths.out, 'metadata.json'), {
    tenant: args.tenant,
    appName: brand.appName,
    bundleId: brand.bundleId,
    version,
    buildNumber,
    platform: args.platform,
    release: args.release,
    configFrom: args.configFrom,
    apiUrl: brand.apiUrl,
    pushEnabled: resolved.pushEnabled,
    legacyStoragePrefix: brand.legacyStoragePrefix ?? null,
    commit: await gitCommit(),
    generatedAt: new Date().toISOString(),
    badging: info,
    signing: {
      certificateSha256: certSha256,
      keystore: signing ? signing.keystore : 'debug',
      alias: signing?.alias ?? 'androiddebugkey',
      external: signing?.external ?? false,
    },
    artifacts: artifacts.map((a) => ({
      file: path.basename(a.file),
      sha256: a.sha256,
      bytes: a.bytes,
    })),
  });

  if (api && args.release && buildConfig && UNSTARTED.includes(buildConfig.app.status)) {
    // Los artefactos ya están: si la plataforma no responde, se avisa y se sigue.
    try {
      await api.updateApp(args.tenant, { status: 'building' });
      log.ok('plataforma: estado building');
    } catch (error) {
      log.warn(`plataforma: no se pudo pasar a building (${(error as Error).message})`);
    }
  }

  log.step('Listo');
  for (const artifact of artifacts) log.info(path.relative(REPO_ROOT, artifact.file));
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`✗ ${error.message}\n\n${APP_USAGE}`);
  } else {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
});
