import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { apiBase } from '../src/http';
import {
  importImages,
  normaliseName,
  parseImageMap,
  retryDelayMs,
  UPLOAD_ATTEMPTS,
  type ImageMap,
} from '../src/import-images';

function imagesDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'import-images-'));
  mkdirSync(path.join(dir, 'products'));
  mkdirSync(path.join(dir, 'brand'));
  for (const file of [
    'products/sandwich.jpg',
    'products/tenders.jpg',
    'brand/logo.png',
    'notes.txt',
  ]) {
    writeFileSync(path.join(dir, file), 'x');
  }
  return dir;
}

describe('mapa de fotos', () => {
  test('normaliza como la app vieja de Carolina', () => {
    expect(normaliseName('Nashville Tenders · 3 pzas')).toBe('nashville tenders 3 pzas');
    expect(normaliseName('  Piña   Colada! ')).toBe('pina colada');
  });

  test('resuelve archivos dentro de --dir y la marca', () => {
    const dir = imagesDir();
    const map = parseImageMap(
      {
        $comment: 'nota',
        items: { 'Reaper Tender Sandwich': 'products/sandwich.jpg' },
        brand: { logo: 'brand/logo.png', icon: null },
      },
      dir,
    );
    expect(map.items).toEqual([
      {
        name: 'Reaper Tender Sandwich',
        key: 'reaper tender sandwich',
        file: path.join(realDir(dir), 'products', 'sandwich.jpg'),
      },
    ]);
    expect(map.brand).toEqual({ logo: path.join(realDir(dir), 'brand', 'logo.png'), icon: null });
  });

  test.each([
    [{ items: { A: '../outside.jpg' } }, 'no existe'],
    [{ items: { A: '/etc/passwd' } }, 'relativa'],
    [{ items: { A: 'notes.txt' } }, 'png/jpg/webp'],
    [{ items: { A: 'products/nope.jpg' } }, 'no existe'],
    [
      { items: { 'Sweet Tea': 'products/sandwich.jpg', 'sweet  tea!': 'products/tenders.jpg' } },
      'mismo producto',
    ],
    [{ items: ['x'] }, '"items"'],
    [[], 'objeto JSON'],
  ])('%j → error', (raw, message) => {
    expect(() => parseImageMap(raw, imagesDir())).toThrow(message);
  });

  test('una ruta que sale de --dir por .. se rechaza', () => {
    const dir = imagesDir();
    const inner = path.join(dir, 'products');
    expect(() => parseImageMap({ items: { A: '../brand/logo.png' } }, inner)).toThrow(
      'sale de --dir',
    );
  });

  test('el mapa de Carolina apunta a fotos que existen en el repo de la app vieja', () => {
    const raw = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '..', 'maps', 'carolina-hot-chicken.json'),
        'utf8',
      ),
    ) as { items: Record<string, string>; brand: Record<string, string> };
    expect(Object.keys(raw.items)).toEqual([
      'Reaper Tender Sandwich',
      'Nashville Tenders · 3 pzas',
      'Reaper Box',
    ]);
    expect(raw.brand).toEqual({
      logo: 'brand/logo-carolina-mark.png',
      icon: 'brand/logo-carolina-mark.png',
    });
  });
});

/** mkdtemp en Windows puede devolver la ruta corta (8.3); el mapa usa la real. */
const realDir = (dir: string): string => realpathSync(dir);

interface Call {
  method: string;
  url: string;
  body?: unknown;
  auth: string | null;
  tenant: string | null;
}

/** API falsa: login, menú, marca, subida (con 503 opcionales) y PATCH. */
function fakeApi(
  options: {
    busy?: number;
    brand?: { logoUrl: string | null; iconUrl: string | null };
    role?: string;
  } = {},
) {
  const calls: Call[] = [];
  let busy = options.busy ?? 0;
  let uploads = 0;
  const items = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Reaper Tender Sandwich', imageUrl: null },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Nashville Tenders · 3 pzas',
      imageUrl: 'https://x/old.webp',
    },
  ];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const method = init?.method ?? 'GET';
    const route = url.replace('https://api.test/api', '');
    calls.push({
      method,
      url: route,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: headers.get('authorization'),
      tenant: headers.get('x-tenant-slug'),
    });
    if (route === '/staff/auth/login') {
      return json({
        accessToken: 'tok',
        refreshToken: 'r',
        staff: { id: 'x', email: 'o', name: 'O', role: options.role ?? 'owner' },
      });
    }
    if (route === '/staff/menu') {
      return json({
        currency: 'USD',
        modifierGroups: [],
        categories: [{ id: 'c', name: 'C', sortOrder: 0, isActive: true, items }],
      });
    }
    if (route === '/staff/brand' && method === 'GET')
      return json(options.brand ?? { logoUrl: null, iconUrl: null });
    if (route === '/staff/media') {
      if (busy > 0) {
        busy -= 1;
        return json({ message: 'Ocupado' }, 503);
      }
      uploads += 1;
      return json(
        { url: `https://api.test/api/media/t/${uploads}.webp`, thumbUrl: 'x', width: 1, height: 1 },
        201,
      );
    }
    if (method === 'PATCH') return new Response(null, { status: 204 });
    return json({ message: 'no' }, 404);
  };
  return { calls, fetchImpl };
}

function map(dir: string): ImageMap {
  return parseImageMap(
    {
      items: {
        'Reaper Tender Sandwich': 'products/sandwich.jpg',
        'Nashville Tenders · 3 pzas': 'products/tenders.jpg',
        'Reaper Box': 'products/sandwich.jpg',
      },
      brand: { logo: 'brand/logo.png', icon: 'brand/logo.png' },
    },
    dir,
  );
}

const base = {
  apiUrl: 'https://api.test',
  tenant: 'carolina-hot-chicken',
  email: 'o@x.test',
  password: 'pw',
  force: false,
  dryRun: false,
};

describe('importación', () => {
  test('sube, asigna, salta lo que ya tiene foto y la marca reutiliza la subida', async () => {
    const api = fakeApi();
    const report = await importImages({ ...base, map: map(imagesDir()), fetch: api.fetchImpl });
    expect(report).toEqual({
      uploaded: 2,
      assigned: ['Reaper Tender Sandwich'],
      skipped: ['Nashville Tenders · 3 pzas'],
      missing: ['Reaper Box'],
      brand: ['logoUrl', 'iconUrl'],
    });
    const patches = api.calls.filter((c) => c.method === 'PATCH');
    expect(patches).toEqual([
      expect.objectContaining({
        url: '/staff/menu/items/11111111-1111-4111-8111-111111111111',
        body: { imageUrl: 'https://api.test/api/media/t/1.webp' },
      }),
      expect.objectContaining({
        url: '/staff/brand',
        body: {
          logoUrl: 'https://api.test/api/media/t/2.webp',
          iconUrl: 'https://api.test/api/media/t/2.webp',
        },
      }),
    ]);
    // Todas con la marca; todas menos el login con el token.
    expect(api.calls.every((c) => c.tenant === 'carolina-hot-chicken')).toBe(true);
    expect(api.calls.slice(1).every((c) => c.auth === 'Bearer tok')).toBe(true);
  });

  test('--force reemplaza; --dry-run no escribe nada', async () => {
    const forced = fakeApi({ brand: { logoUrl: 'a', iconUrl: 'b' } });
    const report = await importImages({
      ...base,
      force: true,
      map: map(imagesDir()),
      fetch: forced.fetchImpl,
    });
    expect(report.assigned).toEqual(['Reaper Tender Sandwich', 'Nashville Tenders · 3 pzas']);

    const dry = fakeApi();
    const dryReport = await importImages({
      ...base,
      dryRun: true,
      map: map(imagesDir()),
      fetch: dry.fetchImpl,
    });
    expect(dryReport.uploaded).toBe(0);
    expect(dry.calls.filter((c) => c.method !== 'GET' && c.url !== '/staff/auth/login')).toEqual(
      [],
    );
  });

  test('la marca ya tiene logo e ícono: no se tocan', async () => {
    const api = fakeApi({ brand: { logoUrl: 'a', iconUrl: 'b' } });
    const report = await importImages({ ...base, map: map(imagesDir()), fetch: api.fetchImpl });
    expect(report.brand).toEqual([]);
    expect(api.calls.some((c) => c.url === '/staff/brand' && c.method === 'PATCH')).toBe(false);
  });

  test('logo e ícono exigen la cuenta del dueño', async () => {
    const api = fakeApi({ role: 'manager' });
    await expect(
      importImages({ ...base, map: map(imagesDir()), fetch: api.fetchImpl }),
    ).rejects.toThrow('dueño');
  });

  test('503 del semáforo: reintenta con backoff, una subida a la vez', async () => {
    const api = fakeApi({ busy: 2 });
    const waits: number[] = [];
    const report = await importImages({
      ...base,
      map: map(imagesDir()),
      fetch: api.fetchImpl,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([1000, 2000]);
    expect(report.uploaded).toBe(2);
  });

  test('503 persistente: falla tras los reintentos', async () => {
    const api = fakeApi({ busy: 99 });
    await expect(
      importImages({
        ...base,
        map: map(imagesDir()),
        fetch: api.fetchImpl,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('HTTP 503');
    expect(api.calls.filter((c) => c.url === '/staff/media')).toHaveLength(UPLOAD_ATTEMPTS);
  });

  test('espera: Retry-After si viene (tope 60 s), si no exponencial', () => {
    expect(retryDelayMs(1, null)).toBe(1000);
    expect(retryDelayMs(3, null)).toBe(4000);
    expect(retryDelayMs(1, '5')).toBe(5000);
    expect(retryDelayMs(1, '600')).toBe(60000);
    expect(retryDelayMs(2, 'Wed, 21 Oct')).toBe(2000);
  });

  test('base de la API: con o sin /api, solo http(s), sin credenciales', () => {
    expect(apiBase('http://localhost:3000')).toBe('http://localhost:3000/api');
    expect(apiBase('https://api.ventea.tech/api/')).toBe('https://api.ventea.tech/api');
    expect(() => apiBase('ftp://x')).toThrow();
    expect(() => apiBase('https://u:p@x')).toThrow('credenciales');
  });
});
