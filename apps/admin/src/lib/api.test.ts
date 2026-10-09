import { describe, expect, it, vi } from 'vitest';

import { apiError, json, STAFF_SESSION } from '@/test/fixtures';

import { ApiError, createApiClient, SESSION_EXPIRED_MESSAGE } from './api';
import { createSessionStore } from './session';

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const session = createSessionStore(null);
  session.set(STAFF_SESSION);
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  const client = createApiClient({ session, fetch: fetchMock as unknown as typeof fetch });
  return { session, fetchMock, client };
}

const authOf = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

describe('createApiClient', () => {
  it('manda Bearer, JSON y X-Tenant-Slug (solo si está configurado)', async () => {
    const session = createSessionStore(null);
    session.set(STAFF_SESSION);
    const fetchMock = vi.fn(() => Promise.resolve(json({ ok: true })));
    const client = createApiClient({
      session,
      tenantSlug: 'carolina-hot-chicken',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.request('/staff/orders', { method: 'PATCH', body: { status: 'ready' } });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/staff/orders');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access-1',
      'Content-Type': 'application/json',
      'x-tenant-slug': 'carolina-hot-chicken',
    });
    expect(init.body).toBe(JSON.stringify({ status: 'ready' }));

    const { fetchMock: plain, client: noSlug } = setup(() => json({}));
    await noSlug.request('/tenant', { auth: false });
    const [, plainInit] = plain.mock.calls[0] as unknown as [string, RequestInit];
    expect(plainInit.headers).not.toHaveProperty('x-tenant-slug');
    expect(plainInit.headers).not.toHaveProperty('Authorization');
  });

  it('ante un 401 renueva el token, guarda los nuevos y reintenta una vez', async () => {
    const { client, session, fetchMock } = setup((url, init) => {
      if (url === '/api/auth/refresh')
        return json({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      return authOf(init) === 'Bearer access-2' ? json([1, 2]) : apiError(401, 'Sesión inválida');
    });

    await expect(client.request('/staff/orders')).resolves.toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(refreshInit.body))).toEqual({ refreshToken: 'refresh-1' });
    expect(session.get()).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      staff: STAFF_SESSION.staff,
    });
  });

  it('varios 401 simultáneos comparten un solo refresh', async () => {
    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => (releaseRefresh = resolve));
    const { client, fetchMock } = setup(async (url, init) => {
      if (url === '/api/auth/refresh') {
        await refreshGate;
        return json({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      }
      return authOf(init) === 'Bearer access-2' ? json('ok') : apiError(401, 'Sesión inválida');
    });

    const results = Promise.all([client.request('/a'), client.request('/b'), client.request('/c')]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4)); // 3 × 401 + 1 refresh
    releaseRefresh();

    await expect(results).resolves.toEqual(['ok', 'ok', 'ok']);
    const refreshes = fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh');
    expect(refreshes).toHaveLength(1);
  });

  it('si otro request ya renovó el token, reintenta con el nuevo sin refrescar otra vez', async () => {
    const { client, session, fetchMock } = setup((url, init) => {
      if (url === '/api/auth/refresh') return json({ accessToken: 'x', refreshToken: 'y' });
      if (authOf(init) === 'Bearer access-1') {
        // Mientras este request viajaba, otro completó el refresh.
        session.updateTokens({ accessToken: 'access-2', refreshToken: 'refresh-2' });
        return apiError(401, 'Sesión inválida');
      }
      return json('ok');
    });

    await expect(client.request('/staff/orders')).resolves.toBe('ok');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/staff/orders',
      '/api/staff/orders',
    ]);
    expect(authOf(fetchMock.mock.calls[1]![1] as RequestInit)).toBe('Bearer access-2');
  });

  it.each([400, 401, 403])('refresh rechazado (%i) borra la sesión', async (status) => {
    const { client, session } = setup((url) =>
      url === '/api/auth/refresh' ? apiError(status, 'Token inválido') : apiError(401, 'x'),
    );

    const error = await client.request('/staff/orders').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: SESSION_EXPIRED_MESSAGE });
    expect(session.get()).toBeNull();
  });

  it('refresh con 5xx o sin red conserva la sesión', async () => {
    const { client, session } = setup((url) =>
      url === '/api/auth/refresh' ? apiError(503, 'Mantenimiento') : apiError(401, 'x'),
    );
    await expect(client.request('/staff/orders')).rejects.toMatchObject({ status: 503 });
    expect(session.get()).toEqual(STAFF_SESSION);

    const offline = setup((url) => {
      if (url === '/api/auth/refresh') throw new TypeError('Failed to fetch');
      return apiError(401, 'x');
    });
    await expect(offline.client.request('/staff/orders')).rejects.toMatchObject({ status: 0 });
    expect(offline.session.get()).toEqual(STAFF_SESSION);
  });

  it('si el reintento vuelve a dar 401 (token de cliente) cierra la sesión', async () => {
    const { client, session } = setup((url) =>
      url === '/api/auth/refresh'
        ? json({ accessToken: 'customer-access', refreshToken: 'customer-refresh' })
        : apiError(401, 'Sesión inválida o expirada'),
    );
    await expect(client.request('/staff/orders')).rejects.toMatchObject({ status: 401 });
    expect(session.get()).toBeNull();
  });

  it('las rutas públicas no intentan refresh: el 401 del login llega con el mensaje de la API', async () => {
    const { client, fetchMock, session } = setup(() => apiError(401, 'Credenciales inválidas'));
    await expect(
      client.request('/staff/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({ status: 401, message: 'Credenciales inválidas' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.get()).toEqual(STAFF_SESSION);
  });

  it('arma mensajes legibles: lista de la API, cuerpo vacío y error de red', async () => {
    const list = setup(() =>
      json({ statusCode: 400, message: ['email inválido', 'falta clave'] }, 400),
    );
    await expect(list.client.request('/x')).rejects.toMatchObject({
      status: 400,
      message: 'email inválido. falta clave',
    });

    const empty = setup(() => new Response('bad gateway', { status: 502 }));
    await expect(empty.client.request('/x')).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('502'),
    });

    const offline = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offline.client.request('/x')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('conexión'),
    });
  });

  it('sin sesión no llama a rutas autenticadas', async () => {
    const { client, session, fetchMock } = setup(() => json({}));
    session.set(null);
    await expect(client.request('/staff/orders')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('subidas', () => {
  const file = () => new Blob(['img'], { type: 'image/png' });

  it('multipart sin Content-Type propio, con sesión; 401 → refresh y reintento', async () => {
    let uploads = 0;
    const { client, fetchMock } = setup((url, init) => {
      if (url === '/api/auth/refresh') {
        return json({ accessToken: 'access-2', refreshToken: 'refresh-2' });
      }
      uploads += 1;
      if (authOf(init) === 'Bearer access-1') return apiError(401, 'Token vencido');
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get('file')).toBeTruthy();
      expect(init.headers).not.toHaveProperty('Content-Type');
      return json({ url: 'https://x/a.webp' }, 201);
    });
    const progress: number[] = [];
    const result = await client.upload<{ url: string }>('/staff/media', file(), {
      onProgress: (p) => progress.push(p),
    });
    expect(result.url).toBe('https://x/a.webp');
    expect(uploads).toBe(2);
    expect(progress).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('el error de la API llega con status y código', async () => {
    const { client } = setup(() =>
      json(
        {
          statusCode: 403,
          message: 'x',
          error: 'Forbidden',
          code: 'plan_limit',
          limit: { resource: 'locations', plan: 'basic', planName: 'Básico', max: 1 },
        },
        403,
      ),
    );
    const error = await client.upload('/staff/media', file()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('plan_limit');
    expect((error as ApiError).limit?.max).toBe(1);
  });

  it('XHR: informa el avance y lee la respuesta', async () => {
    const { xhrUpload } = await import('./api');
    class FakeXhr {
      static last: FakeXhr;
      upload: {
        onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void;
      } = {};
      headers: Record<string, string> = {};
      status = 0;
      responseText = '';
      onload?: () => void;
      onerror?: () => void;
      onabort?: () => void;
      constructor() {
        FakeXhr.last = this;
      }
      open() {}
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      abort() {
        this.onabort?.();
      }
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
        this.status = 201;
        this.responseText = '{"url":"https://x/b.webp"}';
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    try {
      const seen: number[] = [];
      const response = await xhrUpload(
        '/api/staff/media',
        new FormData(),
        { Authorization: 'Bearer t' },
        (p) => seen.push(p),
        new AbortController().signal,
      );
      expect(response).toEqual({ status: 201, body: { url: 'https://x/b.webp' } });
      expect(seen).toEqual([0.5]);
      expect(FakeXhr.last.headers.Authorization).toBe('Bearer t');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
