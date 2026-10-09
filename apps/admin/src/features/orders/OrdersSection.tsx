import type { StaffOrder } from '@ventea/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useMatch, useOutletContext } from 'react-router-dom';

import { useTenant } from '@/app/tenant';
import { useI18n } from '@/i18n';
import {
  getSoundStatus,
  playChime,
  readSoundEnabled,
  subscribeSound,
  unlockSound,
  writeSoundEnabled,
  type SoundStatus,
} from '@/lib/preferences';
import { IconClose } from '@/ui/icons';

import { createArrivalTracker } from './arrivals';
import { useActiveOrders, useNotices, useUpdateOrderStatus, type Notice } from './hooks';
import type { StatusAction } from './transitions';

const noSubscribe = () => () => {};
const soundOff = (): SoundStatus => 'unsupported';

export interface OrdersContext {
  activeOrders: ReturnType<typeof useActiveOrders>;
  fresh: ReadonlySet<string>;
  acknowledge: (orderId?: string) => void;
  currency: string | undefined;
  soundEnabled: boolean;
  /** Sonido activado pero el navegador lo tiene suspendido (falta un toque). */
  soundBlocked: boolean;
  toggleSound: () => void;
  unlockSound: () => void;
  changeStatus: (order: StaffOrder, action: StatusAction) => void;
}

export function useOrdersContext(): OrdersContext {
  return useOutletContext<OrdersContext>();
}

/**
 * Sección de pedidos: el tablero y el historial comparten la carga de pedidos
 * activos, así el contador de nuevos del título sigue contando aunque el staff esté
 * mirando el historial.
 */
export function OrdersSection() {
  const { data: tenant } = useTenant();
  const { t } = useI18n();
  const isHistory = useMatch('/orders/history') !== null;
  const activeOrders = useActiveOrders();
  const { notices, push, dismiss } = useNotices();
  const updateStatus = useUpdateOrderStatus(push);

  const [tracker] = useState(createArrivalTracker);
  const fresh = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const [soundEnabled, setSoundEnabled] = useState(readSoundEnabled);

  useEffect(() => {
    if (!activeOrders.data) return;
    const arrived = tracker.observe(activeOrders.data.map((order) => order.id));
    if (arrived.length > 0 && soundEnabled) playChime();
  }, [activeOrders.data, tracker, soundEnabled]);

  useEffect(() => {
    const brand = tenant?.name ?? 'Ventea';
    document.title =
      fresh.size > 0
        ? t('orders.pageTitleFresh', { count: fresh.size, brand })
        : t('orders.pageTitle', { brand });
    return () => void (document.title = t('app.defaultTitle'));
  }, [fresh, tenant?.name, t]);

  // El AudioContext solo existe con el sonido activado (sin gesto, Chrome avisa en consola).
  const soundStatus = useSyncExternalStore(
    soundEnabled ? subscribeSound : noSubscribe,
    soundEnabled ? getSoundStatus : soundOff,
  );

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    writeSoundEnabled(next);
    setSoundEnabled(next);
    // El click es el gesto que el navegador exige para dejar sonar.
    if (next) void unlockSound();
  }, [soundEnabled]);

  const { mutate } = updateStatus;
  const changeStatus = useCallback(
    (order: StaffOrder, action: StatusAction) => {
      tracker.acknowledge(order.id);
      mutate({ order, to: action.to });
    },
    [mutate, tracker],
  );

  const context: OrdersContext = {
    activeOrders,
    fresh,
    acknowledge: tracker.acknowledge,
    currency: tenant?.currency,
    soundEnabled,
    soundBlocked: soundEnabled && soundStatus === 'blocked',
    toggleSound,
    unlockSound: () => void unlockSound(),
    changeStatus,
  };

  const activeCount = activeOrders.data?.length;

  return (
    <div className={`orders${isHistory ? ' orders--history' : ' orders--board'}`}>
      <header className="page-head">
        <h1 className="page-head__title">
          {isHistory ? t('orders.historyHeading') : t('orders.heading')}
        </h1>
        <nav className="segmented" aria-label={t('orders.views')}>
          <NavLink to="/orders" end className="segmented__item">
            {t('orders.active')}
            {activeCount !== undefined && (
              <>
                <span className="segmented__count" aria-hidden="true">
                  {activeCount}
                </span>
                <span className="sr-only">, {t('orders.count', { count: activeCount })}</span>
              </>
            )}
          </NavLink>
          <NavLink to="/orders/history" className="segmented__item">
            {t('orders.history')}
          </NavLink>
        </nav>
      </header>
      {/* Lectores de pantalla: anuncia los pedidos nuevos sin mover el foco. */}
      <p className="sr-only" role="status" aria-live="polite">
        {fresh.size > 0 ? t('orders.fresh', { count: fresh.size }) : ''}
      </p>
      <Outlet context={context} />
      <NoticeList notices={notices} onDismiss={dismiss} />
    </div>
  );
}

function NoticeList({
  notices,
  onDismiss,
}: {
  notices: Notice[];
  onDismiss: (id: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice notice--${notice.tone}`}>
          <p>{notice.text}</p>
          <button
            type="button"
            className="notice__close"
            onClick={() => onDismiss(notice.id)}
            aria-label={t('notice.dismiss')}
          >
            <IconClose size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}
