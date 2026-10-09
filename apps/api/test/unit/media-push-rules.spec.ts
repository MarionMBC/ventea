import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { contrastRatio, createMenuItemSchema, reorderSchema, textContrastOn } from '@ventea/shared';

import { redactSensitive } from '@/common/logging/redact';
import { brandWarnings, defaultBundleId, defaultPublisher } from '@/modules/branding/brand-rules';
import { detectImageFormat } from '@/modules/media/image-signature';
import {
  absoluteMediaUrl,
  MEDIA_FILE_PATTERN,
  mediaPath,
  parseMediaRef,
  publicBaseUrl,
} from '@/modules/media/media-url';
import {
  decryptCredentials,
  encryptCredentials,
  parseCredentialsKey,
} from '@/modules/push/push-crypto';
import { brandLanguage, isOrderPushStatus, orderPushText } from '@/modules/push/push-messages';

const TENANT = '1bd3392c-bb1a-44d8-8e23-910b4690e791';
const OTHER = 'e86a5978-7fad-4600-af53-902a236370e0';
const HASH = 'a'.repeat(64);

describe('magic bytes de imágenes', () => {
  it('reconoce PNG, JPEG y WebP por contenido', () => {
    expect(
      detectImageFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])),
    ).toBe('png');
    expect(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectImageFormat(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1'))).toBe(
      'webp',
    );
  });

  it('rechaza texto, HTML, GIF, SVG, RIFF que no es WebP y archivos cortos', () => {
    for (const sample of [
      'hola',
      '<html>',
      'GIF89a',
      '<svg xmlns="x">',
      'RIFF\0\0\0\0WAVEfmt ',
      '',
    ]) {
      expect(detectImageFormat(Buffer.from(sample, 'latin1'))).toBeNull();
    }
    expect(detectImageFormat(Buffer.from([0x89, 0x50]))).toBeNull();
  });
});

describe('URLs de medios', () => {
  it('acepta la URL absoluta de la subida o la ruta, y devuelve marca y hash', () => {
    expect(parseMediaRef(`https://x.ventea.tech${mediaPath(TENANT, HASH)}`)).toEqual({
      tenantId: TENANT,
      hash: HASH,
    });
    expect(parseMediaRef(mediaPath(TENANT, HASH))).toEqual({ tenantId: TENANT, hash: HASH });
  });

  it.each([
    'https://evil.example/x.png',
    mediaPath(TENANT, HASH, true), // miniatura no es imagen principal
    `${mediaPath(TENANT, HASH)}?x=1`,
    `https://x.test${mediaPath(TENANT, HASH)}?x=1`,
    `https://u:p@x.test${mediaPath(TENANT, HASH)}`,
    `/api/media/${TENANT}/../${OTHER}/${HASH}.webp`,
    `/api/media/${TENANT}/${HASH.toUpperCase()}.webp`,
    `javascript:alert(1)//${mediaPath(TENANT, HASH)}`,
    'no-url',
  ])('rechaza %s', (ref) => {
    expect(parseMediaRef(ref)).toBeNull();
  });

  it('solo sirve nombres de hash', () => {
    expect(MEDIA_FILE_PATTERN.test(`${HASH}.webp`)).toBe(true);
    expect(MEDIA_FILE_PATTERN.test(`${HASH}.thumb.webp`)).toBe(true);
    for (const name of ['../x.webp', `${HASH}.png`, `${HASH}.webp/..`, '.env', `${HASH}.webp\0`]) {
      expect(MEDIA_FILE_PATTERN.test(name)).toBe(false);
    }
  });

  it('absolutiza solo rutas propias; base por variable o por Host saneado', () => {
    expect(absoluteMediaUrl(mediaPath(TENANT, HASH), 'https://a.test')).toBe(
      `https://a.test${mediaPath(TENANT, HASH)}`,
    );
    expect(absoluteMediaUrl('https://legado.test/logo.png', 'https://a.test')).toBe(
      'https://legado.test/logo.png',
    );
    expect(absoluteMediaUrl(null, 'https://a.test')).toBeNull();
    expect(publicBaseUrl('https://cdn.test///', 'http', 'x')).toBe('https://cdn.test');
    expect(publicBaseUrl('', 'https', 'carolina.ventea.tech')).toBe('https://carolina.ventea.tech');
    expect(publicBaseUrl(undefined, 'http', 'evil.test/"><script>')).toBe('http://localhost');
    expect(publicBaseUrl(undefined, 'javascript', 'a.test')).toBe('http://a.test');
  });
});

describe('contraste y advertencias de Mi marca', () => {
  it('razón de contraste WCAG', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(textContrastOn('#E23B2E').white).toBeCloseTo(4.29, 2);
  });

  it('avisa si el texto blanco no llega a AA y recomienda negro', () => {
    expect(brandWarnings({ primaryColor: '#d4372b', secondaryColor: '#1f1d1b' })).toEqual([]);
    const warnings = brandWarnings({
      primaryColor: '#E23B2E',
      accentColor: '#ffcc00',
      secondaryColor: null,
    });
    expect(warnings.map((w) => [w.field, w.recommendedTextColor])).toEqual([
      ['primaryColor', 'black'],
      ['accentColor', 'black'],
    ]);
    expect(warnings[0]!.message).toMatch(/4\.29:1/);
  });

  it('bundle id y quién publica por defecto', () => {
    expect(defaultBundleId('carolina-hot-chicken')).toBe('app.ventea.carolinahotchicken');
    expect(defaultBundleId('24-horas')).toBe('app.ventea.t24horas');
    expect(defaultPublisher('chain')).toBe('client');
    expect(defaultPublisher('pro')).toBe('ventea');
    expect(defaultPublisher(null)).toBe('ventea');
  });
});

describe('contratos del menú', () => {
  const base = { categoryId: TENANT, name: 'X', basePriceCents: 100 };

  it('defaults, tags normalizados y sin repetidos', () => {
    const parsed = createMenuItemSchema.parse({ ...base, tags: ['Hot', 'hot ', 'new'] });
    expect(parsed).toMatchObject({
      tags: ['hot', 'new'],
      isAvailable: true,
      imageUrl: null,
      modifierGroupIds: [],
    });
  });

  it('rechaza centavos negativos o decimales, campos extra y grupos repetidos', () => {
    expect(createMenuItemSchema.safeParse({ ...base, basePriceCents: -1 }).success).toBe(false);
    expect(createMenuItemSchema.safeParse({ ...base, basePriceCents: 1.5 }).success).toBe(false);
    expect(createMenuItemSchema.safeParse({ ...base, tenantId: OTHER }).success).toBe(false);
    expect(
      createMenuItemSchema.safeParse({ ...base, modifierGroupIds: [OTHER, OTHER] }).success,
    ).toBe(false);
    expect(
      reorderSchema.safeParse({
        items: [
          { id: OTHER, sortOrder: 0 },
          { id: OTHER, sortOrder: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('cifrado de credenciales push (AES-256-GCM)', () => {
  const key = randomBytes(32);

  it('ida y vuelta; el texto cifrado no contiene el original y cambia en cada cifrado', () => {
    const plain = JSON.stringify({ privateKey: '-----BEGIN PRIVATE KEY-----abc' });
    const a = encryptCredentials(plain, key, TENANT);
    const b = encryptCredentials(plain, key, TENANT);
    expect(a).not.toBe(b);
    expect(a).not.toContain('PRIVATE');
    expect(decryptCredentials(a, key, TENANT)).toBe(plain);
  });

  it('falla con otra marca (AAD), otra clave o un byte alterado', () => {
    const stored = encryptCredentials('secreto', key, TENANT);
    expect(() => decryptCredentials(stored, key, OTHER)).toThrow();
    expect(() => decryptCredentials(stored, randomBytes(32), TENANT)).toThrow();
    const parts = stored.split('.');
    const data = Buffer.from(parts[3]!, 'base64url');
    data[0] = data[0]! ^ 1;
    parts[3] = data.toString('base64url');
    expect(() => decryptCredentials(parts.join('.'), key, TENANT)).toThrow();
    expect(() => decryptCredentials('v2.x.y.z', key, TENANT)).toThrow();
  });

  it('rechaza un tag truncado (GCM acepta 4 bytes si no se fija authTagLength) o un IV de otro largo', () => {
    const stored = encryptCredentials('secreto', key, TENANT);
    const [version, iv, tag, data] = stored.split('.');
    const shortTag = Buffer.from(tag!, 'base64url').subarray(0, 4).toString('base64url');
    expect(() =>
      decryptCredentials([version, iv, shortTag, data].join('.'), key, TENANT),
    ).toThrow();
    const longIv = Buffer.concat([Buffer.from(iv!, 'base64url'), Buffer.alloc(4)]).toString(
      'base64url',
    );
    expect(() => decryptCredentials([version, longIv, tag, data].join('.'), key, TENANT)).toThrow();
    expect(Buffer.from(tag!, 'base64url')).toHaveLength(16);
    expect(Buffer.from(iv!, 'base64url')).toHaveLength(12);
  });

  it('clave: 32 bytes en hex o base64; lo demás no', () => {
    expect(parseCredentialsKey('00'.repeat(32))?.length).toBe(32);
    expect(parseCredentialsKey(randomBytes(32).toString('base64'))?.length).toBe(32);
    expect(parseCredentialsKey('corta')).toBeNull();
    expect(parseCredentialsKey(randomBytes(16).toString('base64'))).toBeNull();
    expect(parseCredentialsKey(undefined)).toBeNull();
    expect(parseCredentialsKey('  ')).toBeNull();
  });
});

describe('textos del push', () => {
  it('ES por defecto, EN si la marca lo pide; solo estados que avisan', () => {
    expect(orderPushText(brandLanguage(null), 'ready', 'CAR-1234', 'Carolina')).toEqual({
      title: 'Carolina',
      body: '¡Tu pedido CAR-1234 está listo para retirar!',
    });
    expect(orderPushText(brandLanguage('en'), 'cancelled', 'CAR-1', 'C').body).toBe(
      'Your order CAR-1 was cancelled.',
    );
    expect(brandLanguage('fr')).toBe('es');
    expect(['preparing', 'ready', 'completed', 'cancelled'].every(isOrderPushStatus)).toBe(true);
    expect(isOrderPushStatus('confirmed')).toBe(false);
  });
});

describe('redacción de credenciales push en logs', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  it('borra un PEM de clave privada, crudo o dentro de un JSON escapado', () => {
    const raw = redactSensitive(`error con ${privateKey} al firmar`);
    expect(raw).not.toMatch(/MII|BEGIN PRIVATE KEY/);
    expect(raw).toContain('[REDACTED PRIVATE KEY]');
    const json = redactSensitive(
      JSON.stringify({ body: JSON.stringify({ private_key: privateKey }) }),
    );
    expect(json).not.toMatch(/MII|PRIVATE KEY-----\\n/);
  });

  it('borra private_key, access_token, assertion y pushToken por clave', () => {
    const line = redactSensitive(
      '{"private_key":"abc","accessToken":"ya29.secreto","assertion":"eyJ.x.y","pushToken":"fcm-token-123","pushCredentialsEnc":"v1.a.b.c"}',
    );
    for (const secret of ['abc', 'ya29.secreto', 'eyJ.x.y', 'fcm-token-123', 'v1.a.b.c']) {
      expect(line).not.toContain(secret);
    }
    expect(redactSensitive('pushToken=fcm-1&x=2')).toBe('pushToken="[REDACTED]"&x=2');
  });
});
