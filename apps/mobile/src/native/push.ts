import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ActionPerformed, PermissionStatus, Token } from '@capacitor/push-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { deleteDevice, registerDevice } from '../api/endpoints';
import { sessionStore } from '../api/session';
import type { KeyValueStorage } from '../api/storage';
import { localStorageOrNull } from '../api/storage';
import type { Device, RegisterDeviceInput } from '../api/types';
import { BUILD_BRAND, IS_NATIVE, storageKey } from '../brand/runtime';

/**
 * Push notifications, client side.
 *
 * - Off unless the build ships the brand's Firebase config
 *   (`brand.config.json` → `push.enabled`). Without `google-services.json`
 *   the Android plugin crashes on `register()`, so it is never called: the
 *   app works the same, just without push.
 * - Permission is asked after the guest's first order — the moment a
 *   notification is obviously useful ("your order is ready") — never on launch.
 * - The token is registered with `POST /api/devices` while signed in, and the
 *   device is deleted on sign-out so the next person on the phone does not
 *   get the previous one's orders.
 * - Tapping a notification with `data.orderId` opens that order's tracking.
 */

/** The slice of the Capacitor plugin this module uses, so tests can fake it. */
export interface PushPlugin {
  checkPermissions: () => Promise<PermissionStatus>;
  requestPermissions: () => Promise<PermissionStatus>;
  register: () => Promise<void>;
  addListener: ((
    event: 'registration',
    listener: (token: Token) => void,
  ) => Promise<PluginListenerHandle>) &
    ((
      event: 'registrationError',
      listener: (error: unknown) => void,
    ) => Promise<PluginListenerHandle>) &
    ((
      event: 'pushNotificationActionPerformed',
      listener: (action: ActionPerformed) => void,
    ) => Promise<PluginListenerHandle>);
}

export type PushPermission = 'granted' | 'denied' | 'unavailable';

export interface PushDeps {
  /** Brand config says the build has Firebase, the platform is native and the plugin exists. */
  available: boolean;
  platform: 'android' | 'ios';
  plugin: PushPlugin;
  storage: KeyValueStorage | null;
  keys: { asked: string; deviceId: string };
  isSignedIn: () => boolean;
  register: (input: RegisterDeviceInput) => Promise<Device>;
  unregister: (id: string) => Promise<void>;
}

export interface PushController {
  readonly available: boolean;
  /** Installs the listeners once; `onOpenOrder` receives a validated order id. */
  init: (onOpenOrder: (orderId: string) => void) => Promise<void>;
  /** After an order: asks once, registers when granted. */
  afterOrderPlaced: () => Promise<PushPermission | 'already-asked'>;
  /** After sign-in: re-registers if permission was granted before. */
  afterSignIn: () => Promise<void>;
  /** Before the session is cleared: forgets this device on the API. */
  beforeSignOut: () => void;
}

const ORDER_ID = /^[A-Za-z0-9-]{1,64}$/;

/** Order id from a notification's data, or null when absent or malformed. */
export const orderIdFromNotification = (
  action: Pick<ActionPerformed, 'notification'>,
): string | null => {
  const data: unknown = action.notification?.data;
  const value =
    data && typeof data === 'object' ? (data as Record<string, unknown>).orderId : undefined;
  return typeof value === 'string' && ORDER_ID.test(value) ? value : null;
};

const read = (storage: KeyValueStorage | null, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const write = (storage: KeyValueStorage | null, key: string, value: string | null) => {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    /* Lives for this run only. */
  }
};

export const createPushController = (deps: PushDeps): PushController => {
  let initialised = false;

  const registerToken = async (token: string) => {
    if (!deps.isSignedIn() || !token) return;
    try {
      const device = await deps.register({ platform: deps.platform, pushToken: token });
      if (device && typeof device.id === 'string')
        write(deps.storage, deps.keys.deviceId, device.id);
    } catch {
      /* The API may not have /api/devices yet, or be offline: push simply
         stays off until the next sign-in or order. */
    }
  };

  const toPermission = (status: PermissionStatus): PushPermission =>
    status.receive === 'granted' ? 'granted' : 'denied';

  return {
    available: deps.available,

    init: async (onOpenOrder) => {
      if (!deps.available || initialised) return;
      initialised = true;
      try {
        await deps.plugin.addListener('registration', (token) => void registerToken(token.value));
        await deps.plugin.addListener('registrationError', () => undefined);
        await deps.plugin.addListener('pushNotificationActionPerformed', (action) => {
          const orderId = orderIdFromNotification(action);
          if (orderId) onOpenOrder(orderId);
        });
      } catch {
        /* A plugin that fails to attach leaves the app without push, not broken. */
      }
    },

    afterOrderPlaced: async () => {
      if (!deps.available) return 'unavailable';
      try {
        if (read(deps.storage, deps.keys.asked)) {
          const current = toPermission(await deps.plugin.checkPermissions());
          if (current === 'granted') await deps.plugin.register();
          return 'already-asked';
        }
        write(deps.storage, deps.keys.asked, '1');
        const status = await deps.plugin.checkPermissions();
        const permission =
          status.receive === 'prompt' || status.receive === 'prompt-with-rationale'
            ? toPermission(await deps.plugin.requestPermissions())
            : toPermission(status);
        if (permission === 'granted') await deps.plugin.register();
        return permission;
      } catch {
        return 'unavailable';
      }
    },

    afterSignIn: async () => {
      if (!deps.available) return;
      try {
        if (toPermission(await deps.plugin.checkPermissions()) === 'granted') {
          await deps.plugin.register();
        }
      } catch {
        /* Not this time. */
      }
    },

    beforeSignOut: () => {
      const id = read(deps.storage, deps.keys.deviceId);
      write(deps.storage, deps.keys.deviceId, null);
      if (!id || !deps.available) return;
      /* Fired before the session is cleared: the request picks up the
         current token synchronously. Best effort — a failure leaves a stale
         token the API cleans up when FCM rejects it. */
      deps.unregister(id).catch(() => undefined);
    },
  };
};

const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

/** The app-wide controller. */
export const push = createPushController({
  available:
    BUILD_BRAND.push.enabled && IS_NATIVE && Capacitor.isPluginAvailable('PushNotifications'),
  platform,
  plugin: PushNotifications as unknown as PushPlugin,
  storage: localStorageOrNull(),
  keys: { asked: storageKey('push.asked'), deviceId: storageKey('push.deviceId') },
  isSignedIn: () => sessionStore.get() !== null,
  register: registerDevice,
  unregister: deleteDevice,
});
