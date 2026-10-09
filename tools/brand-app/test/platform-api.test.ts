import { describe, expect, test } from 'vitest';

import { PlatformApi } from '../src/platform-api';

const config = {
  tenant: { slug: 'demo-burgers', name: 'Demo Burgers', currency: 'CLP' },
  apiBaseUrl: 'https://api.ventea.tech/api',
  branding: {
    appDisplayName: 'Demo Burgers',
    primaryColor: '#2e6fe2',
    secondaryColor: '#1f1d1b',
    accentColor: null,
    logoUrl: null,
    iconUrl: null,
    storeShortDescription: null,
    supportEmail: null,
    websiteUrl: null,
    language: 'es',
  },
  app: {
    bundleId: 'app.ventea.demoburgers',
    publisher: 'ventea',
    status: 'requested',
    version: null,
    buildNumber: null,
    storeUrls: { android: null, ios: null },
  },
  push: { configured: false, projectId: null },
};

describe('cliente de plataforma', () => {
  test('build-config con el token en el header y validado', async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const api = new PlatformApi('https://api.ventea.tech', 'secret-token', async (url, init) => {
      seen.push({ url, auth: new Headers(init?.headers).get('authorization') });
      return new Response(JSON.stringify(config), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const result = await api.buildConfig('demo-burgers');
    expect(result.app.bundleId).toBe('app.ventea.demoburgers');
    expect(seen).toEqual([
      {
        url: 'https://api.ventea.tech/api/platform/tenants/demo-burgers/app/build-config',
        auth: 'Bearer secret-token',
      },
    ]);
  });

  test('los errores no llevan el token', async () => {
    const api = new PlatformApi(
      'https://api.ventea.tech/api',
      'secret-token',
      async () => new Response(JSON.stringify({ message: 'Token inválido' }), { status: 401 }),
    );
    const error = await api.updateApp('demo-burgers', { buildNumber: 2 }).catch((e: Error) => e);
    expect(String(error)).toContain('HTTP 401 — Token inválido');
    expect(String(error)).not.toContain('secret-token');
  });

  test('sin token no arranca', () => {
    expect(() => new PlatformApi('https://api.ventea.tech', '')).toThrow('VENTEA_PLATFORM_TOKEN');
  });
});
