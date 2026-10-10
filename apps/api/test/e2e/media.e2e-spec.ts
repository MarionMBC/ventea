import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { MediaList, MediaUploadResponse } from '@ventea/shared';
import sharp from 'sharp';
import request from 'supertest';

import { MediaGc } from '@/modules/media/media-gc.service';

import {
  createApp,
  createRawPrisma,
  createStaffMember,
  loginStaff,
  loginStaffAs,
  seedTenant,
  type TestTenant,
} from './helpers';

/** PNG de `width`×`height` con EXIF (incluye datos "privados" que no deben sobrevivir). */
async function pngWithExif(width = 2400, height = 1200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#e23b2e' } })
    .withExif({ IFD0: { Copyright: 'SECRETO-EXIF', Artist: 'Ana Pérez' } })
    .png()
    .toBuffer();
}

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: '#1f1d1b' } })
    .withExif({ IFD0: { Copyright: 'SECRETO-EXIF', Make: 'Telefono' } })
    .jpeg()
    .toBuffer();
}

/** Ruido: no comprime, sirve para llenar la cuota con pocas subidas. */
async function noisePng(size = 1200): Promise<Buffer> {
  return sharp(randomBytes(size * size * 3), { raw: { width: size, height: size, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

describe('Medios: subida y servido (TASK-016)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let otherOwner: string;

  const upload = (
    token: string,
    slug: string,
    file: Buffer,
    filename: string,
    contentType: string,
  ) =>
    request(app.getHttpServer())
      .post('/api/staff/media')
      .set('X-Tenant-Slug', slug)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, { filename, contentType });

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'media');
    other = await seedTenant(prisma, 'media-otra');
    owner = (await loginStaff(app, tenant)).accessToken;
    otherOwner = (await loginStaff(app, other)).accessToken;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('normaliza: WebP ≤ 1600 px, miniatura de 400, sin EXIF, URL absoluta y nombre por hash', async () => {
    const response = await upload(
      owner,
      tenant.slug,
      await pngWithExif(),
      'foto.png',
      'image/png',
    ).expect(201);
    const body = response.body as MediaUploadResponse;
    expect(body.width).toBe(1600);
    expect(body.height).toBe(800);
    expect(body.url).toMatch(
      new RegExp(`^http://[^/]+/api/media/${tenant.id}/[0-9a-f]{64}\\.webp$`),
    );
    expect(body.thumbUrl).toBe(body.url.replace(/\.webp$/, '.thumb.webp'));

    const served = await request(app.getHttpServer())
      .get(pathOf(body.url))
      .buffer(true)
      .expect(200);
    expect(served.headers['content-type']).toBe('image/webp');
    expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const bytes = served.body as Buffer;
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.exif).toBeUndefined();
    expect(bytes.includes(Buffer.from('SECRETO-EXIF'))).toBe(false);

    const thumb = await request(app.getHttpServer())
      .get(pathOf(body.thumbUrl))
      .buffer(true)
      .expect(200);
    expect((await sharp(thumb.body as Buffer).metadata()).width).toBe(400);
  });

  it('JPEG con EXIF: se quita también', async () => {
    const response = await upload(
      owner,
      tenant.slug,
      await jpegWithExif(),
      'f.jpg',
      'image/jpeg',
    ).expect(201);
    const served = await request(app.getHttpServer())
      .get(pathOf((response.body as MediaUploadResponse).url))
      .buffer(true)
      .expect(200);
    expect((await sharp(served.body as Buffer).metadata()).exif).toBeUndefined();
    expect((served.body as Buffer).includes(Buffer.from('SECRETO-EXIF'))).toBe(false);
  });

  it('la misma imagen dos veces: mismo hash, un solo registro', async () => {
    const png = await pngWithExif(300, 300);
    const first = await upload(owner, tenant.slug, png, 'a.png', 'image/png').expect(201);
    const second = await upload(owner, tenant.slug, png, 'b.png', 'image/png').expect(201);
    const paths = (r: request.Response) => {
      const body = r.body as MediaUploadResponse;
      return [pathOf(body.url), pathOf(body.thumbUrl), body.width, body.height];
    };
    expect(paths(second)).toEqual(paths(first));
    const hash = /([0-9a-f]{64})\.webp$/.exec((first.body as MediaUploadResponse).url)![1]!;
    expect(await prisma.mediaAsset.count({ where: { tenantId: tenant.id, hash } })).toBe(1);
  });

  describe('rechazos de seguridad', () => {
    it('tipo falso: texto declarado como PNG → 415', async () => {
      await upload(
        owner,
        tenant.slug,
        Buffer.from('hola, no soy una imagen'),
        'x.png',
        'image/png',
      ).expect(415);
    });

    it('HTML con extensión de imagen → 415', async () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      await upload(owner, tenant.slug, html, 'x.jpg', 'image/jpeg').expect(415);
    });

    it('PNG real declarado como otro tipo → 415', async () => {
      await upload(owner, tenant.slug, await pngWithExif(200, 200), 'x.html', 'text/html').expect(
        415,
      );
    });

    it('GIF (no admitido) → 415', async () => {
      const gif = await sharp({
        create: { width: 10, height: 10, channels: 3, background: '#000' },
      })
        .gif()
        .toBuffer();
      await upload(owner, tenant.slug, gif, 'x.gif', 'image/png').expect(415);
    });

    it('magic de PNG con cuerpo basura → 415 sin detalles de libvips', async () => {
      const fake = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        randomBytes(500),
      ]);
      const response = await upload(owner, tenant.slug, fake, 'x.png', 'image/png').expect(415);
      expect(JSON.stringify(response.body)).not.toMatch(/vips|sharp/i);
    });

    it('magic de PNG con contenido JPEG → 415 (no coinciden)', async () => {
      const jpeg = await jpegWithExif();
      const disguised = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        jpeg,
      ]);
      await upload(owner, tenant.slug, disguised, 'x.png', 'image/png').expect(415);
    });

    it('polyglot (PNG + HTML/ZIP pegado al final): se acepta re-codificado, sin la carga', async () => {
      const payload = Buffer.from('<script>alert("xss")</script>PK\u0003\u0004evil.zip');
      const polyglot = Buffer.concat([await pngWithExif(64, 64), payload]);
      const response = await upload(owner, tenant.slug, polyglot, 'p.png', 'image/png').expect(201);
      const served = await request(app.getHttpServer())
        .get(pathOf((response.body as MediaUploadResponse).url))
        .buffer(true)
        .expect(200);
      expect((served.body as Buffer).includes(Buffer.from('<script>'))).toBe(false);
      expect((served.body as Buffer).includes(Buffer.from('evil.zip'))).toBe(false);
    });

    it('más de 5 MB → 413', async () => {
      const big = Buffer.concat([await pngWithExif(10, 10), Buffer.alloc(5 * 1024 * 1024 + 10)]);
      const response = await upload(owner, tenant.slug, big, 'big.png', 'image/png').catch(
        (error: { response?: request.Response }) => {
          // El servidor puede cortar la conexión mientras el cliente todavía escribe.
          if (error.response) return error.response;
          throw error;
        },
      );
      expect(response.status).toBe(413);
    });

    it('más de 24 megapíxeles (bomba de descompresión chica en bytes) → 413', async () => {
      const huge = await sharp({
        create: { width: 5000, height: 5000, channels: 3, background: '#fff' },
      })
        .png()
        .toBuffer();
      expect(huge.length).toBeLessThan(1024 * 1024);
      const response = await upload(owner, tenant.slug, huge, 'bomba.png', 'image/png').expect(413);
      expect((response.body as { message: string }).message).toMatch(/24 MP/);
    });

    it('un campo de texto extra o sin archivo → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/staff/media')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${owner}`)
        .field('path', '../../etc/passwd')
        .attach('file', await pngWithExif(20, 20), { filename: 'a.png', contentType: 'image/png' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/staff/media')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${owner}`)
        .expect(400);
    });

    it('el nombre del archivo subido no se usa: un nombre con traversal da un hash normal', async () => {
      const response = await upload(
        owner,
        tenant.slug,
        await pngWithExif(30, 30),
        '../../../evil.webp',
        'image/png',
      ).expect(201);
      expect((response.body as MediaUploadResponse).url).toMatch(/\/[0-9a-f]{64}\.webp$/);
    });

    it.each([
      (tid: string) => `/api/media/${tid}/..%2F..%2Fpackage.json`,
      (tid: string) => `/api/media/${tid}/..%2F${tid}%2Fx.webp`,
      () => '/api/media/..%2F..%2Fetc/passwd',
      (tid: string) => `/api/media/${tid}/${'a'.repeat(64)}.png`,
      (tid: string) => `/api/media/${tid}/${'a'.repeat(64)}.webp`,
      () => `/api/media/not-a-uuid/${'a'.repeat(64)}.webp`,
      (tid: string) => `/api/media/${tid}/.env`,
    ])('path traversal / nombres inválidos → 404 (%#)', async (build) => {
      const response = await request(app.getHttpServer()).get(build(tenant.id));
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).not.toMatch(/image/);
    });
  });

  describe('permisos', () => {
    it('sin sesión 401; staff (rol) 403; manager puede', async () => {
      await request(app.getHttpServer())
        .post('/api/staff/media')
        .set('X-Tenant-Slug', tenant.slug)
        .attach('file', await pngWithExif(20, 20), { filename: 'a.png', contentType: 'image/png' })
        .expect(401);
      const staff = await loginStaffAs(
        app,
        tenant,
        await createStaffMember(prisma, tenant, 'staff'),
      );
      await upload(staff, tenant.slug, await pngWithExif(20, 20), 'a.png', 'image/png').expect(403);
      const manager = await loginStaffAs(
        app,
        tenant,
        await createStaffMember(prisma, tenant, 'manager'),
      );
      await upload(manager, tenant.slug, await pngWithExif(21, 21), 'a.png', 'image/png').expect(
        201,
      );
    });

    it('token de una marca contra otra → 401', async () => {
      await upload(otherOwner, tenant.slug, await pngWithExif(20, 20), 'a.png', 'image/png').expect(
        401,
      );
    });
  });

  describe('consistencia de medios', () => {
    it('el borrado toma el lock de medios de la marca (no corre en medio de un uso)', async () => {
      const response = await upload(
        owner,
        tenant.slug,
        await pngWithExif(33, 33),
        'l.png',
        'image/png',
      ).expect(201);
      const hash = /([0-9a-f]{64})\.webp$/.exec((response.body as MediaUploadResponse).url)![1]!;
      const holdMs = 1_500;
      let released = 0;
      // Otra transacción (como un PATCH de ítem que referencia la imagen) tiene el lock.
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`media:${tenant.id}`}))`;
          await new Promise((resolve) => setTimeout(resolve, holdMs));
          released = Date.now();
        },
        { timeout: 10_000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await request(app.getHttpServer())
        .delete(`/api/staff/media/${hash}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${owner}`)
        .expect(204);
      const finished = Date.now();
      await holder;
      expect(released).toBeGreaterThan(0);
      expect(finished).toBeGreaterThanOrEqual(released);
    });

    it('si falla la escritura del archivo no queda registro ni archivo a medias', async () => {
      const png = await pngWithExif(37, 37);
      const dir = join(process.env.MEDIA_DIR!, tenant.id);
      // Un archivo donde va la carpeta de la marca hace fallar la escritura.
      const backup = `${dir}.bak-${Date.now()}`;
      await rename(dir, backup);
      await writeFile(dir, 'no soy una carpeta');
      const before = await prisma.mediaAsset.count({ where: { tenantId: tenant.id } });
      try {
        await upload(owner, tenant.slug, png, 'f.png', 'image/png').expect(500);
        expect(await prisma.mediaAsset.count({ where: { tenantId: tenant.id } })).toBe(before);
      } finally {
        await rm(dir, { force: true });
        await rename(backup, dir);
      }
    });
  });

  describe('aislamiento por marca', () => {
    it('lista y borra solo lo propio; no puede borrar lo de otra marca', async () => {
      const mine = await upload(
        otherOwner,
        other.slug,
        await pngWithExif(40, 40),
        'a.png',
        'image/png',
      ).expect(201);
      const hash = /([0-9a-f]{64})\.webp$/.exec((mine.body as MediaUploadResponse).url)![1]!;

      const list = await request(app.getHttpServer())
        .get('/api/staff/media')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
      expect((list.body as MediaList).items.some((item) => item.hash === hash)).toBe(false);
      expect((list.body as MediaList).quotaBytes).toBe(200 * 1024 * 1024);

      await request(app.getHttpServer())
        .delete(`/api/staff/media/${hash}`)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${owner}`)
        .expect(404);
      // La imagen de la otra marca sigue servida.
      await request(app.getHttpServer())
        .get(pathOf((mine.body as MediaUploadResponse).url))
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/staff/media/${hash}`)
        .set('X-Tenant-Slug', other.slug)
        .set('Authorization', `Bearer ${otherOwner}`)
        .expect(204);
      await request(app.getHttpServer())
        .get(pathOf((mine.body as MediaUploadResponse).url))
        .expect(404);
    });
  });
});

describe('Medios: cuota y rate limit (TASK-016)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let owner: string;

  beforeAll(async () => {
    process.env.MEDIA_QUOTA_MB = '1';
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'media-cuota');
    owner = (await loginStaff(app, tenant)).accessToken;
  });

  afterAll(async () => {
    process.env.MEDIA_QUOTA_MB = '';
    process.env.MEDIA_UPLOAD_RATE_LIMIT_PER_HOUR = '';
    await app.close();
    await prisma.$disconnect();
  });

  const upload = (file: Buffer) =>
    request(app.getHttpServer())
      .post('/api/staff/media')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${owner}`)
      .attach('file', file, { filename: 'n.png', contentType: 'image/png' });

  it('pasar la cuota → 403 con mensaje, sin archivo ni registro', async () => {
    const before = await prisma.mediaAsset.count({ where: { tenantId: tenant.id } });
    const response = await upload(await noisePng()).expect(403);
    expect((response.body as { message: string }).message).toMatch(/límite de 1 MB/);
    expect(await prisma.mediaAsset.count({ where: { tenantId: tenant.id } })).toBe(before);
  });

  it('rate limit por marca → 429 con Retry-After', async () => {
    process.env.MEDIA_UPLOAD_RATE_LIMIT_PER_HOUR = '3';
    // Ya hubo 1 intento (la cuota). Dos más entran, el siguiente no.
    await upload(await pngWithExif(10, 10)).expect(201);
    await upload(await pngWithExif(11, 11)).expect(201);
    const response = await upload(await pngWithExif(12, 12)).expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('Medios: GC de archivos huérfanos (TASK-025)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let owner: string;
  let dir: string;

  const HOUR = 60 * 60_000;
  const fakeHash = () => randomBytes(32).toString('hex');

  /** Archivo en la carpeta de la marca con `mtime` de hace `ageMs`. */
  async function place(name: string, ageMs: number): Promise<string> {
    const file = join(dir, name);
    await writeFile(file, randomBytes(64));
    const at = new Date(Date.now() - ageMs);
    await utimes(file, at, at);
    return file;
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'media-gc');
    owner = (await loginStaff(app, tenant)).accessToken;
    dir = join(process.env.MEDIA_DIR!, tenant.id);
    await mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('borra solo huérfanos de más de 1 h: los registrados, los recientes y lo ajeno quedan', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/staff/media')
      .set('X-Tenant-Slug', tenant.slug)
      .set('Authorization', `Bearer ${owner}`)
      .attach('file', await pngWithExif(41, 41), { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const kept = /([0-9a-f]{64})\.webp$/.exec((uploaded.body as MediaUploadResponse).url)![1]!;
    // Registrado y viejo: queda.
    for (const name of [`${kept}.webp`, `${kept}.thumb.webp`]) {
      const at = new Date(Date.now() - 3 * HOUR);
      await utimes(join(dir, name), at, at);
    }

    const orphan = fakeHash();
    const recent = fakeHash();
    const gone = [
      await place(`${orphan}.webp`, 2 * HOUR),
      await place(`${orphan}.thumb.webp`, 2 * HOUR),
      await place(`${fakeHash()}.webp.${randomUUID()}.tmp`, 2 * HOUR),
    ];
    const stay = [
      join(dir, `${kept}.webp`),
      join(dir, `${kept}.thumb.webp`),
      // Una subida en curso: el registro todavía no está commiteado.
      await place(`${recent}.webp`, 10 * 60_000),
      // Lo que no tiene forma de medio no se toca.
      await place('notas.txt', 5 * HOUR),
    ];

    const run = await app.get(MediaGc).run();
    expect(run.removedFiles).toBeGreaterThanOrEqual(3);
    for (const file of gone) await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
    for (const file of stay) await expect(stat(file)).resolves.toBeTruthy();

    // La imagen registrada se sigue sirviendo.
    await request(app.getHttpServer()).get(`/api/media/${tenant.id}/${kept}.webp`).expect(200);
  });

  it('sin huérfanos para borrar no toma el lock: una subida en curso no la hace saltear', async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`media:${tenant.id}`}))`;
        locked();
        await released;
      },
      { timeout: 30_000 },
    );
    await lockTaken;
    try {
      // Lo de la marca está registrado o es reciente: se lista y se descarta sin el lock.
      expect((await app.get(MediaGc).run()).skipped).toBe(0);
    } finally {
      release();
      await holder;
    }
  });

  it('con el lock de medios de la marca tomado (una subida en curso) la saltea', async () => {
    const orphan = await place(`${fakeHash()}.webp`, 2 * HOUR);
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`media:${tenant.id}`}))`;
        locked();
        await released;
      },
      { timeout: 30_000 },
    );
    await lockTaken;
    try {
      const run = await app.get(MediaGc).run();
      expect(run.skipped).toBeGreaterThanOrEqual(1);
      await expect(stat(orphan)).resolves.toBeTruthy();
    } finally {
      release();
      await holder;
    }
    await app.get(MediaGc).run();
    await expect(stat(orphan)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
