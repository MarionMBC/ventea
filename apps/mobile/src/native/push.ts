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
 *   get the previous one's orders. If that DELETE answers late and fails
 *   after the next person registered, and their registration did not take
 *   the token over (a guest, a failed POST), the token dies on the device.
 * - Tapping a notification with `data.orderId` opens that order's tracking.
 */

/** The slice of the Capacitor plugin this module uses, so tests can fake it. */
export interface PushPlugin {
  checkPermissions: () => Promise<PermissionStatus>;
  requestPermissions: () => Promise<PermissionStatus>;
  register: () => Promise<void>;
  /** Invalidates this install's token locally (FCM then reports it as gone). */
  unregister: () => Promise<void>;
  removeAllDeliveredNotifications: () => Promise<void>;
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
  /** How long sign-out waits for the API before giving up. Default 3 s. */
  signOutTimeoutMs?: number;
}

export interface PushController {
  readonly available: boolean;
  /**
   * Installs the listeners once and sets where a tapped notification goes.
   * Calling it again only replaces `onOpenOrder` (a remounted router passes
   * its new `navigate`): the listener always calls the latest one.
   */
  init: (onOpenOrder: (orderId: string) => void) => Promise<void>;
  /** After an order: asks once, registers when granted. */
  afterOrderPlaced: () => Promise<PushPermission | 'already-asked'>;
  /** After sign-in: re-registers if permission was granted before. */
  afterSignIn: () => Promise<void>;
  /**
   * Before the session is cleared: deletes this device on the API (with the
   * normal refresh, so an expired access token still works), invalidates the
   * local token and clears delivered notifications. Waits at most
   * `signOutTimeoutMs`; never throws.
   */
  beforeSignOut: () => Promise<void>;
}

/** Order ids are UUIDs; anything else in a notification is ignored. */
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  let openOrder: (orderId: string) => void = () => undefined;
  const timeoutMs = deps.signOutTimeoutMs ?? 3000;
  /**
   * Bumped on every native `register()`. A sign-out clean-up that outlives its
   * 3 s cap compares it before killing the local token: if someone registered
   * since (the next person signed in), the token is theirs now.
   */
  let generation = 0;
  /** Whether the API holds this install's token for whoever is here now. */
  let registered: 'pending' | 'yes' | 'no' = 'no';
  /**
   * A late sign-out DELETE failed after someone registered again: the API may
   * still send the previous customer's notifications to this token. Settled by
   * the outcome of that registration (`settleOrphan`).
   */
  let orphan = false;
  const registerNative = () => {
    generation += 1;
    registered = 'pending';
    return deps.plugin.register();
  };

  const killLocalToken = async () => {
    await deps.plugin.unregister().catch(() => undefined);
    await deps.plugin.removeAllDeliveredNotifications().catch(() => undefined);
  };

  /**
   * If the new registration took the token over on the API (POST ok), the old
   * device is gone with it. If it did not (a guest, a failed POST), the only way
   * to stop the previous customer's notifications is to kill the token here: the
   * DELETE cannot be retried without their session. Waits while it is pending.
   */
  const settleOrphan = async () => {
    if (!orphan || registered === 'pending') return;
    orphan = false;
    if (registered === 'no') await killLocalToken();
  };

  const registerToken = async (token: string) => {
    if (!deps.isSignedIn() || !token) {
      registered = 'no';
      await settleOrphan();
      return;
    }
    try {
      const device = await deps.register({ platform: deps.platform, pushToken: token });
      if (device && typeof device.id === 'string')
        write(deps.storage, deps.keys.deviceId, device.id);
      registered = 'yes';
    } catch {
      /* The API may not have /api/devices yet, or be offline: push simply
         stays off until the next sign-in or order. */
      registered = 'no';
    }
    await settleOrphan();
  };

  const toPermission = (status: PermissionStatus): PushPermission =>
    status.receive === 'granted' ? 'granted' : 'denied';

  return {
    available: deps.available,

    init: async (onOpenOrder) => {
      openOrder = onOpenOrder;
      if (!deps.available || initialised) return;
      initialised = true;
      try {
        await deps.plugin.addListener('registration', (token) => void registerToken(token.value));
        await deps.plugin.addListener('registrationError', () => {
          registered = 'no';
          void settleOrphan();
        });
        await deps.plugin.addListener('pushNotificationActionPerformed', (action) => {
          const orderId = orderIdFromNotification(action);
          if (orderId) openOrder(orderId);
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
          if (current === 'granted') await registerNative();
          return 'already-asked';
        }
        write(deps.storage, deps.keys.asked, '1');
        const status = await deps.plugin.checkPermissions();
        const permission =
          status.receive === 'prompt' || status.receive === 'prompt-with-rationale'
            ? toPermission(await deps.plugin.requestPermissions())
            : toPermission(status);
        if (permission === 'granted') await registerNative();
        return permission;
      } catch {
        return 'unavailable';
      }
    },

    afterSignIn: async () => {
      if (!deps.available) return;
      try {
        if (toPermission(await deps.plugin.checkPermissions()) === 'granted') {
          await registerNative();
        }
      } catch {
        /* Not this time. */
      }
    },

    beforeSignOut: async () => {
      const id = read(deps.storage, deps.keys.deviceId);
      write(deps.storage, deps.keys.deviceId, null);
      if (!deps.available) return;
      const signedOutAt = generation;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      const cleanUp = async () => {
        /* Still signed in here: the DELETE goes with the session (and its
           refresh, if the access token expired) of the person leaving. */
        const deleted = id
          ? await deps.unregister(id).then(
              () => true,
              () => false,
            )
          : true;
        /* Past the cap and someone registered since: that token is theirs,
           unless the API still has it for the person who left (see `orphan`). */
        if (generation !== signedOutAt) {
          if (!deleted) {
            orphan = true;
            await settleOrphan();
          }
          return;
        }
        /* Even if the API was unreachable, the token dies on the device: FCM
           answers UNREGISTERED and the API drops it on the next send. */
        await killLocalToken();
      };
      try {
        await Promise.race([cleanUp(), deadline]);
      } finally {
        clearTimeout(timer);
      }
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
