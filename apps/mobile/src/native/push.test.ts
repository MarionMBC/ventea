import { describe, expect, test, vi } from 'vitest';
import type { PermissionStatus } from '@capacitor/push-notifications';
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
    expect(() => push.beforeSignOut()).not.toThrow();
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

  test('sign-out deletes the device on the API and forgets it', async () => {
    const { controller, storage, unregister } = setup();
    storage.setItem('device', 'device-9');
    controller.beforeSignOut();
    expect(unregister).toHaveBeenCalledWith('device-9');
    expect(storage.getItem('device')).toBeNull();
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
    [{ orderId: 'abc-123' }, 'abc-123'],
  ])('notification data %o → %s', (data, expected) => {
    expect(orderIdFromNotification({ notification: { id: '1', data } } as never)).toBe(expected);
  });
});
