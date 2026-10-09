import { afterEach, describe, expect, test } from 'vitest';

import { apiBase, secureUrl } from '../src/http';
import { childEnv, run, SECRET_ENV } from '../src/run';

const saved = { ...process.env };
afterEach(() => {
  for (const key of SECRET_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('entorno de los procesos hijos', () => {
  test('vite/cap/gradle/git nunca heredan el token ni la cuenta del dueño', async () => {
    process.env.VENTEA_PLATFORM_TOKEN = 'platform-secret';
    process.env.VENTEA_OWNER_EMAIL = 'owner@x.test';
    process.env.VENTEA_OWNER_PASSWORD = 'owner-secret';
    const out = await run(
      process.execPath,
      ['-e', 'process.stdout.write(JSON.stringify(process.env))'],
      { capture: true, env: { VENTEA_BRAND_FILE: '/b.json' } },
    );
    const env = JSON.parse(out) as Record<string, string>;
    expect(env.VENTEA_PLATFORM_TOKEN).toBeUndefined();
    expect(env.VENTEA_OWNER_EMAIL).toBeUndefined();
    expect(env.VENTEA_OWNER_PASSWORD).toBeUndefined();
    expect(env.VENTEA_BRAND_FILE).toBe('/b.json');
    expect(env.PATH ?? env.Path).toBeTruthy();
  });

  test('extras explícitos (keytool) y variables quitadas', () => {
    const env = childEnv(
      { VENTEA_KS_PASS: 'only-for-keytool', VITE_API_URL: undefined },
      { VITE_API_URL: 'http://dev', VENTEA_PLATFORM_TOKEN: 't', HOME: '/h' },
    );
    expect(env).toEqual({ VENTEA_KS_PASS: 'only-for-keytool', HOME: '/h' });
  });
});

describe('URLs con credenciales', () => {
  test('https siempre; http solo hacia la propia máquina', () => {
    expect(apiBase('http://localhost:3000')).toBe('http://localhost:3000/api');
    expect(apiBase('http://127.0.0.1:3000/api')).toBe('http://127.0.0.1:3000/api');
    expect(apiBase('http://[::1]:3000')).toBe('http://[::1]:3000/api');
    expect(() => apiBase('http://api.example.com')).toThrow('https');
    expect(() => apiBase('http://localhost.evil.test')).toThrow('https');
    expect(() => secureUrl('ftp://x')).toThrow();
  });
});
