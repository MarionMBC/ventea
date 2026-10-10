import { describe, expect, test, vi } from 'vitest';
import type { PermissionStatus } from '@capacitor/push-notifications';
import { createApiClient } from '../api/client';
import { createSessionStore } from '../api/session';
import { memoryStorage } from '../api/storage';
import type { PushDeps, PushPlugin } from './push';
import { createPushController, orderIdFromNotification, push } from './push';

type Listener = (payload: unknown) => void;

const fakePlugin = (
  receive: PermissionStatus['receive'],
  afterRequest: PermissionStatus['receive'] = receive,
) => {
  const listeners = new Map<string, Listener>();
  let current = receive;
  const plugin = {
    checkPermissions: vi.fn(async () => ({ receive: current })),
    requestPermissions: vi.fn(async () => {
      current = afterRequest;
      return { receive: current };
    }),
    register: vi.fn(async () => {
      listeners.get('registration')?.({ value: 'token-1' });
    }),
    unregister: vi.fn(async () => undefined),
    removeAllDeliveredNotifications: vi.fn(async () => undefined),
    addListener: vi.fn(async (event: string, listener: Listener) => {
      listeners.set(event, listener);
      return { remove: async () => undefined };
    }),
  };
  return { plugin, listeners };
};

const setup = (
  overrides: Partial<PushDeps> = {},
  receive: PermissionStatus['receive'] = 'prompt',
) => {
  const { plugin, listeners } = fakePlugin(receive, 'granted');
  const storage = memoryStorage();
  const register = vi.fn(async () => ({ id: 'device-1' }));
  const unregister = vi.fn(async () => undefined);
  const controller = createPushController({
    available: true,
    platform: 'android',
    plugin: plugin as unknown as PushPlugin,
    storage,
    keys: { asked: 'asked', deviceId: 'device' },
    isSignedIn: () => true,
    register,
    unregister,
    ...overrides,
  });
  return { controller, plugin, listeners, storage, register, unregister };
};

/** Lets the fake plugin's promise chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('push', () => {
  test('the app-wide controller is off in a build without push (tests, web, no Firebase)', async () => {
    expect(push.available).toBe(false);
    await expect(push.afterOrderPlaced()).resolves.toBe('unavailable');
    await expect(push.beforeSignOut()).resolves.toBeUndefined();
  });

  test('unavailable: never touches the native plugin', async () => {
    const { controller, plugin } = setup({ available: false });
    await controller.init(() => undefined);
    await controller.afterOrderPlaced();
    await controller.afterSignIn();
    expect(plugin.addListener).not.toHaveBeenCalled();
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.register).not.toHaveBeenCalled();
  });

  test('asks once, after the first order, and registers the token with the API', async () => {
    const { controller, plugin, register, storage } = setup();
    await controller.init(() => undefined);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();

    await expect(controller.afterOrderPlaced()).resolves.toBe('granted');
    await flush();

    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith({ platform: 'android', pushToken: 'token-1' });
    expect(storage.getItem('device')).toBe('device-1');

    await expect(controller.afterOrderPlaced()).resolves.toBe('already-asked');
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  test('a denied permission is not asked again and registers nothing', async () => {
    const { plugin } = fakePlugin('prompt', 'denied');
    const register = vi.fn();
    const controller = createPushController({
      available: true,
      platform: 'ios',
      plugin: plugin as unknown as PushPlugin,
      storage: memoryStorage(),
      keys: { asked: 'asked', deviceId: 'device' },
      isSignedIn: () => true,
      register,
      unregister: vi.fn(),
    });
    await expect(controller.afterOrderPlaced()).resolves.toBe('denied');
    await expect(controller.afterOrderPlaced()).resolves.toBe('already-asked');
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    expect(plugin.register).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  test('signed out: the token is not sent', async () => {
    const { controller, register } = setup({ isSignedIn: () => false });
    await controller.init(() => undefined);
    await controller.afterOrderPlaced();
    await flush();
    expect(register).not.toHaveBeenCalled();
  });

  test('an API without /api/devices does not break anything', async () => {
    const { controller } = setup({ register: vi.fn(async () => Promise.reject(new Error('404'))) });
    await controller.init(() => undefined);
    await expect(controller.afterOrderPlaced()).resolves.toBe('granted');
    await flush();
  });

  test('sign-out deletes the device, kills the local token and clears notifications', async () => {
    const { controller, storage, unregister, plugin } = setup();
    storage.setItem('device', 'device-9');
    await controller.beforeSignOut();
    expect(unregister).toHaveBeenCalledWith('device-9');
    expect(storage.getItem('device')).toBeNull();
    expect(plugin.unregister).toHaveBeenCalledTimes(1);
    expect(plugin.removeAllDeliveredNotifications).toHaveBeenCalledTimes(1);
  });

  test('sign-out with an expired access token: DELETE goes through after a refresh', async () => {
    const store = createSessionStore(memoryStorage());
    store.set({
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      customer: { id: 'c-1', email: 'a@b.test', firstName: null, lastName: null, phone: null },
    });
    const json = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'fresh', refreshToken: 'refresh-2' }))
      .mockResolvedValueOnce(json(204));
    const client = createApiClient({
      baseUrl: '',
      tenantSlug: 't',
      session: store,
      fetch: fetchMock,
    });
    const { controller, storage } = setup({
      unregister: (id) => client.delete<void>(`/api/devices/${id}`),
    });
    storage.setItem('device', 'device-9');

    await controller.beforeSignOut();
    store.clear('signed-out');

    const calls = fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`);
    expect(calls).toEqual([
      'DELETE /api/devices/device-9',
      'POST /api/auth/refresh',
      'DELETE /api/devices/device-9',
    ]);
    const lastHeaders = (fetchMock.mock.calls[2]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(lastHeaders.Authorization).toBe('Bearer fresh');
  });

  test('sign-out never hangs on a dead API', async () => {
    const { controller, storage } = setup({
      unregister: () => new Promise<void>(() => undefined),
      signOutTimeoutMs: 20,
    });
    storage.setItem('device', 'device-9');
    await expect(controller.beforeSignOut()).resolves.toBeUndefined();
  });

  /**
   * The late DELETE of the previous customer fails after the next person on the phone registered,
   * and that registration did not take the token over (a guest, or its POST failed): the API would
   * keep sending the previous customer's notifications here. The token dies on the device instead.
   */
  const lateFailedDelete = async (
    next: 'guest' | 'post-ok' | 'post-fails',
    deleteFails: 'after-post' | 'during-post',
  ) => {
    let failDelete: () => void = () => undefined;
    let answerPost: () => void = () => undefined;
    const register = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve, reject) => {
          answerPost = () =>
            next === 'post-fails' ? reject(new Error('offline')) : resolve({ id: 'device-2' });
          if (deleteFails === 'after-post') answerPost();
        }),
    );
    const ctx = setup(
      {
        unregister: () =>
          new Promise<void>((_, reject) => (failDelete = () => reject(new Error('503')))),
        signOutTimeoutMs: 20,
        isSignedIn: () => next !== 'guest',
        register,
      },
      'granted',
    );
    await ctx.controller.init(() => undefined);
    ctx.storage.setItem('device', 'device-9');
    await ctx.controller.beforeSignOut(); // the cap wins: the DELETE is still in flight
    await ctx.controller.afterOrderPlaced(); // the next person, on the same phone
    await flush();
    failDelete();
    await flush();
    answerPost();
    await flush();
    return { ...ctx, register };
  };

  for (const deleteFails of ['after-post', 'during-post'] as const) {
    test(`late DELETE fails, the next one is a guest: the local token dies (${deleteFails})`, async () => {
      const { plugin, register } = await lateFailedDelete('guest', deleteFails);
      expect(register).not.toHaveBeenCalled();
      expect(plugin.unregister).toHaveBeenCalledTimes(1);
      expect(plugin.removeAllDeliveredNotifications).toHaveBeenCalledTimes(1);
    });

    test(`late DELETE fails, the next POST fails: the local token dies (${deleteFails})`, async () => {
      const { plugin, register } = await lateFailedDelete('post-fails', deleteFails);
      expect(register).toHaveBeenCalledTimes(1);
      expect(plugin.unregister).toHaveBeenCalledTimes(1);
    });

    test(`late DELETE fails, the next POST takes the token over: it lives (${deleteFails})`, async () => {
      const { plugin, register, storage } = await lateFailedDelete('post-ok', deleteFails);
      expect(register).toHaveBeenCalledTimes(1);
      expect(storage.getItem('device')).toBe('device-2');
      expect(plugin.unregister).not.toHaveBeenCalled();
    });
  }

  test('a late sign-out clean-up does not kill the token of the next person who signs in', async () => {
    let finishDelete: () => void = () => undefined;
    const { controller, storage, plugin } = setup(
      {
        unregister: () => new Promise<void>((resolve) => (finishDelete = resolve)),
        signOutTimeoutMs: 20,
      },
      'granted',
    );
    await controller.init(() => undefined);
    storage.setItem('device', 'device-9');
    await controller.beforeSignOut(); // the 3 s cap wins: the API is still answering
    await controller.afterSignIn(); // someone else signs in right away
    expect(plugin.register).toHaveBeenCalledTimes(1);
    finishDelete(); // the old DELETE finally answers
    await flush();
    expect(plugin.unregister).not.toHaveBeenCalled();
    expect(plugin.removeAllDeliveredNotifications).not.toHaveBeenCalled();
  });

  test('a remounted router replaces where a tapped notification goes', async () => {
    const { controller, listeners } = setup();
    const first = vi.fn();
    const second = vi.fn();
    await controller.init(first);
    await controller.init(second);
    listeners.get('pushNotificationActionPerformed')?.({
      actionId: 'tap',
      notification: { id: '1', data: { orderId: 'b3c1f7e2-0000-4000-8000-000000000001' } },
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('after sign-in a previously granted device registers again', async () => {
    const { controller, plugin } = setup({}, 'granted');
    await controller.afterSignIn();
    expect(plugin.register).toHaveBeenCalledTimes(1);
  });

  test('tapping a notification opens its order', async () => {
    const { controller, listeners } = setup();
    const open = vi.fn();
    await controller.init(open);
    listeners.get('pushNotificationActionPerformed')?.({
      actionId: 'tap',
      notification: {
        id: '1',
        data: { orderId: 'b3c1f7e2-0000-4000-8000-000000000001', status: 'ready' },
      },
    });
    expect(open).toHaveBeenCalledWith('b3c1f7e2-0000-4000-8000-000000000001');
  });

  test.each([
    [{ orderId: '../../profile' }, null],
    [{ orderId: 42 }, null],
    [{}, null],
    [undefined, null],
    [{ orderId: 'abc-123' }, null],
    [{ orderId: 'b3c1f7e2-0000-4000-8000-00000000000g' }, null],
    [{ orderId: 'B3C1F7E2-0000-4000-8000-000000000001' }, 'B3C1F7E2-0000-4000-8000-000000000001'],
  ])('notification data %o → %s', (data, expected) => {
    expect(orderIdFromNotification({ notification: { id: '1', data } } as never)).toBe(expected);
  });
});
