import { describe, expect, test, vi } from 'vitest';
import {
  ApiError,
  createApiClient,
  networkErrorMessage,
  sessionExpiredMessage,
  timeoutMessage,
} from './client';
import type { KeyValueStorage, Session } from './session';
import { DEFAULT_SESSION_KEY, createSessionStore } from './session';

/* Every test drives the client through an injected fetch: no network, ever. */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const session: Session = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  customer: {
    id: 'c-1',
    email: 'jordan@example.com',
    firstName: 'Jordan',
    lastName: 'Reyes',
    phone: null,
  },
};

const memoryStorage = (): KeyValueStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

const setup = (signedIn = true, timeoutMs?: number) => {
  const store = createSessionStore(memoryStorage());
  if (signedIn) store.set(session);
  const fetchMock = vi.fn<typeof fetch>();
  const client = createApiClient({
    baseUrl: 'https://api.test/',
    tenantSlug: 'demo-burgers',
    session: store,
    fetch: fetchMock,
    timeoutMs,
  });
  return { store, fetchMock, client };
};

type FetchCall = Parameters<typeof fetch>;

const headersOf = (call: FetchCall | undefined) =>
  (call?.[1]?.headers ?? {}) as Record<string, string>;

/** The n-th fetch call; fails the test if it never happened. */
const callOf = (fetchMock: { mock: { calls: FetchCall[] } }, index: number): FetchCall => {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch call #${index} did not happen`);
  return call;
};

describe('api client', () => {
  test('sends the tenant header and the bearer token', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));

    await client.get('/api/me');

    const [url] = callOf(fetchMock, 0);
    expect(url).toBe('https://api.test/api/me');
    expect(headersOf(fetchMock.mock.calls[0])).toMatchObject({
      'X-Tenant-Slug': 'demo-burgers',
      Authorization: 'Bearer access-1',
    });
  });

  test('on a brand subdomain (no slug configured) no tenant header is sent', async () => {
    const store = createSessionStore(memoryStorage());
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json(200, {}));
    const client = createApiClient({
      baseUrl: '',
      tenantSlug: '',
      session: store,
      fetch: fetchMock,
    });

    await client.get('/api/menu', { auth: false });

    const [url] = callOf(fetchMock, 0);
    expect(url).toBe('/api/menu');
    expect(headersOf(callOf(fetchMock, 0))['X-Tenant-Slug']).toBeUndefined();
  });

  test('public calls carry the tenant but no bearer', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(json(200, { categories: [] }));

    await client.get('/api/menu', { auth: false });

    const headers = headersOf(fetchMock.mock.calls[0]);
    expect(headers['X-Tenant-Slug']).toBe('demo-burgers');
    expect(headers.Authorization).toBeUndefined();
  });

  test('serialises the body as JSON', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(json(201, { id: 'o-1' }));

    await client.post('/api/orders', { lines: [] });

    const init = callOf(fetchMock, 0)[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ lines: [] }));
    expect(headersOf(fetchMock.mock.calls[0])['Content-Type']).toBe('application/json');
  });

  test('a 401 refreshes once and retries with the new token', async () => {
    const { client, fetchMock, store } = setup();
    fetchMock
      .mockResolvedValueOnce(json(401, { statusCode: 401, message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(json(200, { id: 'c-1' }));

    await expect(client.get('/api/me')).resolves.toEqual({ id: 'c-1' });

    const refreshCall = callOf(fetchMock, 1);
    const retryCall = callOf(fetchMock, 2);
    expect(refreshCall[0]).toBe('https://api.test/api/auth/refresh');
    expect(refreshCall[1]?.body).toBe(JSON.stringify({ refreshToken: 'refresh-1' }));
    expect(headersOf(refreshCall).Authorization).toBeUndefined();
    expect(headersOf(retryCall).Authorization).toBe('Bearer access-2');
    expect(store.get()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  test('concurrent 401s share a single refresh', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (url.endsWith('/api/auth/refresh')) {
        return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' });
      }
      return auth === 'Bearer access-2'
        ? json(200, { url })
        : json(401, { message: 'Unauthorized' });
    });

    await Promise.all([client.get('/api/me'), client.get('/api/orders')]);

    const refreshes = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/auth/refresh'),
    );
    expect(refreshes).toHaveLength(1);
  });

  test('a rejected refresh clears the session and reports it expired', async () => {
    const { client, fetchMock, store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(401, { message: 'Invalid refresh token' }));

    const error = await client.get('/api/me').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe(sessionExpiredMessage());
    expect(store.get()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null, 'expired');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test.each([500, 502, 503, 429])(
    'a %i on the refresh is transient and keeps the session',
    async (status) => {
      const { client, fetchMock, store } = setup();
      fetchMock
        .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
        .mockResolvedValueOnce(json(status, { message: 'Bad gateway' }));

      const error = (await client.get('/api/me').catch((reason: unknown) => reason)) as ApiError;

      expect(error.isNetworkError).toBe(true);
      expect(store.get()).toEqual(session);
    },
  );

  test.each([
    { accessToken: '', refreshToken: 'refresh-2' },
    { accessToken: 'access-2', refreshToken: '' },
  ])('a 2xx refresh with an empty token (%j) is transient', async (tokens) => {
    const { client, fetchMock, store } = setup();
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(200, tokens));

    await expect(client.get('/api/me')).rejects.toMatchObject({ status: 0 });
    expect(store.get()).toEqual(session);
  });

  test('a 2xx refresh without a token pair is transient, the session stays', async () => {
    const { client, fetchMock, store } = setup();
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(new Response('<html>proxy</html>', { status: 200 }));

    const error = (await client.get('/api/me').catch((reason: unknown) => reason)) as ApiError;

    expect(error.isNetworkError).toBe(true);
    expect(store.get()).toEqual(session);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test.each([400, 403])('a %i on the refresh ends the session', async (status) => {
    const { client, fetchMock, store } = setup();
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(status, { message: 'Invalid refresh token' }));

    await expect(client.get('/api/me')).rejects.toMatchObject({ status: 401 });
    expect(store.get()).toBeNull();
  });

  test('a refresh answered after a sign-out is discarded', async () => {
    const { client, fetchMock, store } = setup();
    let answerRefresh: (response: Response) => void = () => undefined;
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (answerRefresh = resolve)));

    const pending = client.get('/api/me').catch((reason: unknown) => reason);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    store.clear();
    answerRefresh(json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' }));

    expect(await pending).toMatchObject({ status: 401 });
    expect(store.get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a refresh answered after another sign-in is rejected, never replayed as the new account', async () => {
    const { client, fetchMock, store } = setup();
    let answerRefresh: (response: Response) => void = () => undefined;
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (answerRefresh = resolve)));

    const pending = client.post('/api/orders', { lines: [] }).catch((reason: unknown) => reason);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const other: Session = {
      accessToken: 'access-B',
      refreshToken: 'refresh-B',
      customer: { ...session.customer, id: 'c-2', email: 'other@example.com' },
    };
    store.set(other);
    answerRefresh(json(200, { accessToken: 'access-A2', refreshToken: 'refresh-A2' }));

    expect(await pending).toMatchObject({ status: 401, message: sessionExpiredMessage() });
    expect(store.get()).toEqual(other);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a 401 is never replayed with the token of a customer who signed in meanwhile', async () => {
    const { client, fetchMock, store } = setup();
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));

    const pending = client.post('/api/orders', { lines: [] }).catch((reason: unknown) => reason);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    store.set({
      accessToken: 'access-B',
      refreshToken: 'refresh-B',
      customer: { ...session.customer, id: 'c-2' },
    });
    answer(json(401, { message: 'Unauthorized' }));

    expect(await pending).toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.get()?.customer.id).toBe('c-2');
  });

  test('extra headers such as Idempotency-Key are sent, tenant and auth still win', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(json(201, { id: 'o-1' }));

    const testHeaders = {
      'Idempotency-Key': 'key-12345678', // gitleaks:allow — clave de prueba
      'X-Tenant-Slug': 'other',
    };
    await client.post('/api/orders', {}, { headers: testHeaders });

    expect(headersOf(fetchMock.mock.calls[0])).toMatchObject({
      'Idempotency-Key': 'key-12345678', // gitleaks:allow — clave de prueba
      'X-Tenant-Slug': 'demo-burgers',
      Authorization: 'Bearer access-1',
    });
  });

  test('a body that never finishes arriving also times out', async () => {
    const { client, fetchMock } = setup(true, 20);
    fetchMock.mockImplementationOnce(async (_input, init) => {
      const stalled = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError')),
          );
        },
      });
      return new Response(stalled, { status: 200 });
    });

    await expect(client.get('/api/me')).rejects.toMatchObject({
      status: 0,
      message: timeoutMessage(),
    });
  });

  test('a request with no answer times out as a retryable error', async () => {
    const { client, fetchMock } = setup(true, 20);
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    await expect(client.post('/api/orders', {})).rejects.toMatchObject({
      status: 0,
      message: timeoutMessage(),
    });
  });

  test('a caller abort is passed through, not reported as a failure', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();
    const pending = client.get('/api/menu', { auth: false, signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('being offline during the refresh keeps the session', async () => {
    const { client, fetchMock, store } = setup();
    fetchMock
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = (await client.get('/api/me').catch((reason: unknown) => reason)) as ApiError;

    expect(error.isNetworkError).toBe(true);
    expect(store.get()).not.toBeNull();
  });

  test('a 401 on a public call (wrong password) never refreshes', async () => {
    const { client, fetchMock, store } = setup();
    fetchMock.mockResolvedValueOnce(
      json(401, { statusCode: 401, message: 'Invalid email or password' }),
    );

    const error = (await client
      .post('/api/auth/login', { email: 'a@b.co', password: 'x' }, { auth: false })
      .catch((reason: unknown) => reason)) as ApiError;

    expect(error.status).toBe(401);
    expect(error.message).toBe('Invalid email or password');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.get()).not.toBeNull();
  });

  test('a 401 while signed out does not try to refresh', async () => {
    const { client, fetchMock } = setup(false);
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Unauthorized' }));

    await expect(client.get('/api/orders')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('uses the API message, joining validation lists', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(
      json(400, {
        statusCode: 400,
        message: ['quantity too high', 'option unavailable'],
        error: 'Bad Request',
      }),
    );

    await expect(client.post('/api/orders', {})).rejects.toMatchObject({
      status: 400,
      message: 'quantity too high. option unavailable',
    });
  });

  test('a body that is not JSON still yields a readable error', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));

    await expect(client.get('/api/menu', { auth: false })).rejects.toMatchObject({
      status: 502,
      message: 'The restaurant is having trouble right now. Please try again.',
    });
  });

  test('a network failure becomes an ApiError with status 0', async () => {
    const { client, fetchMock } = setup();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(client.get('/api/menu', { auth: false })).rejects.toMatchObject({
      status: 0,
      message: networkErrorMessage(),
    });
  });
});

describe('session store', () => {
  test('persists across store instances', () => {
    const storage = memoryStorage();
    createSessionStore(storage).set(session);
    expect(createSessionStore(storage).get()).toEqual(session);
  });

  test('a storage that throws degrades to signed out instead of crashing', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const store = createSessionStore(broken);
    expect(store.get()).toBeNull();
    store.set(session);
    expect(store.get()).toEqual(session);
    store.clear();
    expect(store.get()).toBeNull();
  });

  test('ignores a corrupted stored value', () => {
    const storage = memoryStorage();
    storage.setItem(DEFAULT_SESSION_KEY, '{"accessToken":1}');
    expect(createSessionStore(storage).get()).toBeNull();
  });
});
