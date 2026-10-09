import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { parseHex, readableOn } from '../../../apps/mobile/src/brand/color';
import type { BrandConfig } from './config';
import { secureUrl, type Fetch } from './http';

/**
 * Íconos y splash de cada marca con sharp, a partir del ícono de Mi marca (`iconUrl`) o, si no
 * hay, de la inicial sobre el color primario. La letra usa el mismo criterio AA que el tema
 * (`readableOn`: blanco, tinta o negro), así el ícono y los botones de la app combinan.
 */

/** Fondo de la app mientras arranca el WebView (= `BACKGROUND` de capacitor.config.ts). */
export const APP_BACKGROUND = '#121010';
export const MASTER_SIZE = 1024;
/** Lo que se descarga de `iconUrl`: lo mismo que admite la subida de medios. */
export const MAX_ICON_BYTES = 5 * 1024 * 1024;

/** Densidades de Android: ícono legacy/redondo (48 dp) y capa del adaptativo (108 dp). */
export const ANDROID_DENSITIES = [
  { dir: 'mipmap-mdpi', legacy: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', legacy: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', legacy: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
] as const;

/**
 * Zona segura del ícono adaptativo: 66 dp de 108. El contenido del primer plano se dibuja
 * dentro, así ninguna máscara del launcher (círculo, squircle) lo corta.
 */
export const ADAPTIVE_SAFE_ZONE = 66 / 108;

export interface IconMasters {
  /** 1024×1024 opaco, a sangre: AppIcon de iOS y base del legacy/redondo de Android. */
  full: Buffer;
  /** 1024×1024 transparente con el contenido en la zona segura: primer plano adaptativo. */
  foreground: Buffer;
  /** Color de la capa de fondo del ícono adaptativo. */
  background: string;
}

/** Primera letra o dígito del nombre (`"  9 Burgers"` → `9`, `"él"` → `É`). */
export function initialOf(name: string): string {
  const char = Array.from(name.normalize('NFC')).find((c) => /[\p{L}\p{N}]/u.test(c));
  return (char ?? '?').toLocaleUpperCase();
}

export function letterColor(primary: string): string {
  const rgb = parseHex(primary);
  if (!rgb) throw new Error(`Color primario inválido: ${primary}`);
  return readableOn(rgb);
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);

function letterSvg(
  size: number,
  letter: string,
  color: string,
  fontRatio: number,
  fill: string | null,
): Buffer {
  const background = fill ? `<rect width="${size}" height="${size}" fill="${fill}"/>` : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${background}` +
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Arial, Helvetica, Liberation Sans, sans-serif" font-weight="700" ` +
      `font-size="${Math.round(size * fontRatio)}" fill="${color}">${escapeXml(letter)}</text></svg>`,
  );
}

/** Sin `iconUrl`: inicial sobre el primario. */
export async function generatedMasters(
  brand: Pick<BrandConfig, 'appName' | 'colors'>,
): Promise<IconMasters> {
  const primary = brand.colors.primary;
  const letter = initialOf(brand.appName);
  const color = letterColor(primary);
  const full = await sharp(letterSvg(MASTER_SIZE, letter, color, 0.6, primary))
    .png()
    .toBuffer();
  const foreground = await sharp(
    letterSvg(MASTER_SIZE, letter, color, 0.6 * ADAPTIVE_SAFE_ZONE, null),
  )
    .png()
    .toBuffer();
  return { full, foreground, background: primary };
}

/** Con el ícono de Mi marca: a sangre para iOS/legacy, dentro de la zona segura para el adaptativo. */
export async function mastersFromImage(image: Buffer, primary: string): Promise<IconMasters> {
  const full = await sharp(image, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(MASTER_SIZE, MASTER_SIZE, { fit: 'cover' })
    .flatten({ background: primary })
    .png()
    .toBuffer();
  const inner = Math.round(MASTER_SIZE * ADAPTIVE_SAFE_ZONE);
  const offset = Math.round((MASTER_SIZE - inner) / 2);
  const foreground = await sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(full).resize(inner, inner).png().toBuffer(),
        left: offset,
        top: offset,
      },
    ])
    .png()
    .toBuffer();
  return { full, foreground, background: primary };
}

/** Tipos de ícono admitidos (los mismos que la subida de medios; nada de SVG). */
export const ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Descarga `iconUrl`. Solo del origen de la API que dio la configuración (los medios de la
 * marca viven ahí), https (http solo localhost), sin seguir redirecciones, png/jpeg/webp, y
 * corta la lectura en cuanto pasa de 5 MB aunque no venga `content-length`.
 */
export async function downloadImage(
  url: string,
  allowedOrigin: string,
  fetchImpl: Fetch = fetch,
): Promise<Buffer> {
  const parsed = secureUrl(url, 'iconUrl');
  if (parsed.origin !== new URL(allowedOrigin).origin) {
    throw new Error(`iconUrl fuera de la API de la marca (${allowedOrigin}): ${url}`);
  }
  const response = await fetchImpl(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`No se pudo descargar el ícono (${response.status}): ${url}`);
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(ICON_TYPES as readonly string[]).includes(type)) {
    throw new Error(`El ícono debe ser png, jpeg o webp (${type || 'sin tipo'})`);
  }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_ICON_BYTES) throw new Error('El ícono pasa de 5 MB');
  if (!response.body) throw new Error('El ícono vino vacío');

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ICON_BYTES) {
      await reader.cancel();
      throw new Error('El ícono pasa de 5 MB');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * `iconUrl` es de dónde se descarga y `allowedOrigin` la API que respondió el build-config:
 * con `--app-api-url` el ícono de `brand` ya apunta a la API de la app, pero el archivo está
 * en la que dio la configuración.
 */
export async function brandMasters(
  brand: BrandConfig,
  iconUrl: string | null = brand.iconUrl,
  allowedOrigin: string = brand.apiUrl,
  fetchImpl: Fetch = fetch,
): Promise<IconMasters> {
  if (!iconUrl) return generatedMasters(brand);
  return mastersFromImage(
    await downloadImage(iconUrl, allowedOrigin, fetchImpl),
    brand.colors.primary,
  );
}

/** Recorta con una máscara SVG (squircle del legacy o círculo). */
export async function masked(
  image: Buffer,
  size: number,
  shape: 'rounded' | 'circle',
): Promise<Buffer> {
  const mask =
    shape === 'circle'
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/>`
      : `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}"/>`;
  return sharp(image)
    .resize(size, size)
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${mask}</svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
}

async function writePng(file: string, image: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(image).png().toFile(file);
}

/** `res/mipmap-*`: ic_launcher (legacy), ic_launcher_round e ic_launcher_foreground. */
export async function writeAndroidIcons(resDir: string, masters: IconMasters): Promise<string[]> {
  const written: string[] = [];
  for (const density of ANDROID_DENSITIES) {
    const dir = path.join(resDir, density.dir);
    const files: [string, Buffer][] = [
      ['ic_launcher.png', await masked(masters.full, density.legacy, 'rounded')],
      ['ic_launcher_round.png', await masked(masters.full, density.legacy, 'circle')],
      [
        'ic_launcher_foreground.png',
        await sharp(masters.foreground)
          .resize(density.foreground, density.foreground)
          .png()
          .toBuffer(),
      ],
    ];
    for (const [name, image] of files) {
      await writePng(path.join(dir, name), image);
      written.push(path.join(dir, name));
    }
  }
  return written;
}

/** Splash: fondo de la app con el ícono al centro. */
export async function splashImage(
  width: number,
  height: number,
  masters: IconMasters,
): Promise<Buffer> {
  const iconSize = Math.round(Math.min(width, height) * 0.3);
  return sharp({ create: { width, height, channels: 3, background: APP_BACKGROUND } })
    .composite([{ input: await masked(masters.full, iconSize, 'rounded'), gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Reescribe cada `splash.png` que trae la plantilla, conservando su tamaño. */
export async function writeSplashes(files: string[], masters: IconMasters): Promise<void> {
  for (const file of files) {
    const { width, height } = await sharp(file).metadata();
    if (!width || !height) throw new Error(`Splash sin medidas: ${file}`);
    await writePng(file, await splashImage(width, height, masters));
  }
}

export async function androidSplashFiles(resDir: string): Promise<string[]> {
  const dirs = (await readdir(resDir)).filter(
    (name) => name === 'drawable' || name.startsWith('drawable-'),
  );
  const files: string[] = [];
  for (const dir of dirs) {
    const file = path.join(resDir, dir, 'splash.png');
    const exists = await stat(file).then(
      (s) => s.isFile(),
      () => false,
    );
    if (exists) files.push(file);
  }
  return files.sort();
}

/** iOS: AppIcon 1024 sin canal alfa (App Store lo rechaza) y las imágenes del Splash. */
export async function writeIosAssets(assetsDir: string, masters: IconMasters): Promise<void> {
  const icon = path.join(assetsDir, 'AppIcon.appiconset', 'AppIcon-512@2x.png');
  await mkdir(path.dirname(icon), { recursive: true });
  await sharp(masters.full).resize(MASTER_SIZE, MASTER_SIZE).removeAlpha().png().toFile(icon);
  const splashDir = path.join(assetsDir, 'Splash.imageset');
  const splashes = (await readdir(splashDir))
    .filter((name) => name.endsWith('.png'))
    .map((name) => path.join(splashDir, name));
  await writeSplashes(splashes, masters);
}
