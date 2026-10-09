import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import {
  ANDROID_DENSITIES,
  androidSplashFiles,
  brandMasters,
  downloadImage,
  generatedMasters,
  initialOf,
  letterColor,
  mastersFromImage,
  MAX_ICON_BYTES,
  writeAndroidIcons,
  writeIosAssets,
  writeSplashes,
} from '../src/icons';
import { MOBILE_DIR } from '../src/paths';

const brand = (appName: string, primary: string) => ({
  appName,
  colors: { primary, secondary: null, accent: null },
});

async function pixel(image: Buffer | string, x: number, y: number) {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
}

describe('ícono generado', () => {
  test('inicial: primera letra o dígito, en mayúscula', () => {
    expect(initialOf('Demo Burgers')).toBe('D');
    expect(initialOf('  9 Burgers')).toBe('9');
    expect(initialOf('¡él!')).toBe('É');
    expect(initialOf('***')).toBe('?');
  });

  test('la letra sigue el criterio AA del tema', () => {
    expect(letterColor('#E23B2E')).toBe('#000000'); // ni blanco ni tinta llegan a 4.5
    expect(letterColor('#2E6FE2')).toBe('#ffffff');
    expect(letterColor('#FDB913')).toBe('#120f0e');
  });

  test('maestro a sangre: primario en las esquinas, letra al centro; adaptativo transparente', async () => {
    const masters = await generatedMasters(brand('Demo Burgers', '#2E6FE2'));
    expect(masters.background).toBe('#2E6FE2');
    const meta = await sharp(masters.full).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 1024]);
    expect(await pixel(masters.full, 5, 5)).toMatchObject({ r: 0x2e, g: 0x6f, b: 0xe2, a: 255 });
    const stats = await sharp(masters.full).stats();
    // Hay letra: no es un cuadrado de un solo color.
    expect(stats.channels[0]!.max - stats.channels[0]!.min).toBeGreaterThan(100);
    expect((await pixel(masters.foreground, 5, 5)).a).toBe(0);
    // La letra del adaptativo queda dentro de la zona segura (66/108).
    const { info } = await sharp(masters.foreground).trim().toBuffer({ resolveWithObject: true });
    expect(Math.max(info.width, info.height)).toBeLessThan(1024 * (66 / 108));
  });

  test('dos marcas, dos íconos distintos', async () => {
    const a = await generatedMasters(brand('Carolina Hot Chicken', '#E23B2E'));
    const b = await generatedMasters(brand('Demo Burgers', '#2E6FE2'));
    expect(a.full.equals(b.full)).toBe(false);
  });
});

describe('ícono desde imagen', () => {
  test('transparente → fondo primario, cuadrado 1024; adaptativo con margen', async () => {
    const source = await sharp({
      create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const masters = await mastersFromImage(source, '#E23B2E');
    expect(await pixel(masters.full, 10, 10)).toMatchObject({ r: 0xe2, g: 0x3b, b: 0x2e, a: 255 });
    expect((await sharp(masters.full).metadata()).width).toBe(1024);
    expect((await pixel(masters.foreground, 5, 5)).a).toBe(0);
    expect((await pixel(masters.foreground, 512, 512)).a).toBe(255);
  });

  test('descarga: solo imágenes http(s) de hasta 5 MB', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const ok = async () => new Response(png, { headers: { 'content-type': 'image/png' } });
    expect((await downloadImage('https://x.test/i.png', ok)).length).toBe(png.length);
    await expect(downloadImage('file:///etc/passwd', ok)).rejects.toThrow('http(s)');
    const html = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
    await expect(downloadImage('https://x.test/i', html)).rejects.toThrow('no es una imagen');
    const big = async () =>
      new Response(png, {
        headers: { 'content-type': 'image/png', 'content-length': String(MAX_ICON_BYTES + 1) },
      });
    await expect(downloadImage('https://x.test/i', big)).rejects.toThrow('5 MB');
    const missing = async () => new Response('', { status: 404 });
    await expect(downloadImage('https://x.test/i', missing)).rejects.toThrow('404');
  });

  test('brandMasters descarga de la URL que se le da, no de la de la marca', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00ff00' } })
      .png()
      .toBuffer();
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      return new Response(png, { headers: { 'content-type': 'image/png' } });
    };
    const config = {
      ...brand('X', '#E23B2E'),
      tenantSlug: 'x',
      apiUrl: 'https://api.ventea.tech',
      bundleId: 'a.b',
      logoUrl: null,
      iconUrl: 'https://api.ventea.tech/api/media/t/i.webp',
      defaultLanguage: 'es' as const,
      currency: 'USD',
      push: { enabled: false },
    };
    await brandMasters(config, 'http://localhost:3000/api/media/t/i.webp', fetchImpl);
    expect(urls).toEqual(['http://localhost:3000/api/media/t/i.webp']);
  });
});

describe('archivos nativos', () => {
  test('Android: legacy, redondo y adaptativo en las 5 densidades; splash con las medidas de la plantilla', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'icons-android-'));
    const res = path.join(dir, 'res');
    cpSync(path.join(MOBILE_DIR, 'android', 'app', 'src', 'main', 'res'), res, { recursive: true });
    const masters = await generatedMasters(brand('Demo', '#2E6FE2'));

    const written = await writeAndroidIcons(res, masters);
    expect(written).toHaveLength(ANDROID_DENSITIES.length * 3);
    for (const density of ANDROID_DENSITIES) {
      const meta = (name: string) => sharp(path.join(res, density.dir, name)).metadata();
      expect((await meta('ic_launcher.png')).width).toBe(density.legacy);
      expect((await meta('ic_launcher_round.png')).width).toBe(density.legacy);
      expect((await meta('ic_launcher_foreground.png')).width).toBe(density.foreground);
    }
    // Redondo: esquina transparente; legacy: centro con el color de la marca.
    expect((await pixel(path.join(res, 'mipmap-xxxhdpi', 'ic_launcher_round.png'), 1, 1)).a).toBe(
      0,
    );

    const splashes = await androidSplashFiles(res);
    expect(splashes.length).toBeGreaterThanOrEqual(11);
    const before = await Promise.all(splashes.map((f) => sharp(f).metadata()));
    await writeSplashes(splashes, masters);
    const after = await Promise.all(splashes.map((f) => sharp(f).metadata()));
    expect(after.map((m) => [m.width, m.height])).toEqual(before.map((m) => [m.width, m.height]));
    expect(await pixel(splashes[0]!, 1, 1)).toMatchObject({ r: 0x12, g: 0x10, b: 0x10 });
  });

  test('iOS: AppIcon 1024 sin alfa y splash 2732', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'icons-ios-'));
    const assets = path.join(dir, 'Assets.xcassets');
    cpSync(path.join(MOBILE_DIR, 'ios', 'App', 'App', 'Assets.xcassets'), assets, {
      recursive: true,
    });
    await writeIosAssets(assets, await generatedMasters(brand('Demo', '#2E6FE2')));
    const icon = await sharp(
      path.join(assets, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
    ).metadata();
    expect([icon.width, icon.height, icon.hasAlpha]).toEqual([1024, 1024, false]);
    const splash = await sharp(
      path.join(assets, 'Splash.imageset', 'splash-2732x2732.png'),
    ).metadata();
    expect([splash.width, splash.height]).toEqual([2732, 2732]);
  });
});
