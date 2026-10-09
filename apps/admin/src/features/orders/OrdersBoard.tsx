import { useState } from 'react';

import { describeError, useI18n } from '@/i18n';
import { IconAlert, IconInbox, IconRefresh, IconVolume, IconVolumeOff } from '@/ui/icons';

import { useNow, usePendingOrderIds } from './hooks';
import { OrderCard } from './OrderCard';
import { useOrdersContext } from './OrdersSection';
import { BOARD_COLUMNS, ordersInColumn, type BoardStatus } from './transitions';

/**
 * Si el foco quedó en <body> (p. ej. se canceló el último pedido y su tarjeta y su
 * columna desaparecieron), lo toma este elemento para no dejar al teclado perdido.
 */
function focusIfLost(element: HTMLElement | null) {
  if (element && (!document.activeElement || document.activeElement === document.body)) {
    element.focus();
  }
}

/** Esqueleto del tablero mientras llega la primera carga. */
function BoardSkeleton({ label }: { label: string }) {
  return (
    <div className="board board--loading" role="status">
      <span className="sr-only">{label}</span>
      <div className="columns" aria-hidden="true">
        {BOARD_COLUMNS.map((column, index) => (
          <div key={column.status} className={`column column--${column.status} is-current`}>
            <div className="column__head">
              <span className="skeleton" style={{ width: '45%', height: 22 }} />
            </div>
            <div className="column__list">
              {Array.from({ length: 3 - index }, (_, i) => (
                <div key={i} className="order-card order-card--skeleton">
                  <span className="skeleton" style={{ width: '40%', height: 22 }} />
                  <span className="skeleton" style={{ width: '70%', height: 14 }} />
                  <span className="skeleton" style={{ width: '90%', height: 14 }} />
                  <span className="skeleton" style={{ width: '100%', height: 44 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tablero del mostrador: tres columnas (Nuevos, En cocina, Listos) lado a lado desde
 * 768 px, cada una con su propio scroll y encabezado fijo; en teléfono, una columna a la
 * vez con un selector de segmentos con contadores.
 */
export function OrdersBoard() {
  const {
    activeOrders,
    fresh,
    acknowledge,
    currency,
    soundEnabled,
    soundBlocked,
    toggleSound,
    unlockSound,
    changeStatus,
  } = useOrdersContext();
  const i18n = useI18n();
  const { t, clock, ago } = i18n;
  const pendingIds = usePendingOrderIds();
  const now = useNow(15_000);
  const [mobileColumn, setMobileColumn] = useState<BoardStatus>('confirmed');
  const { data: orders, error, isPending, isFetching, refetch, dataUpdatedAt } = activeOrders;

  if (isPending) return <BoardSkeleton label={t('board.loading')} />;

  if (!orders) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h2>{t('board.errorTitle')}</h2>
        <p>{describeError(error, i18n)}</p>
        <button type="button" className="btn btn--primary" onClick={() => void refetch()}>
          {t('board.retry')}
        </button>
      </div>
    );
  }

  const updatedAt = new Date(dataUpdatedAt);

  return (
    <section className="board" aria-label={t('board.label')}>
      <div className="toolbar">
        <p className="toolbar__updated">
          {error ? (
            <span className="toolbar__stale" role="alert">
              <IconAlert size={16} />
              {t('board.offline', { time: clock(updatedAt) })}
            </span>
          ) : (
            <>
              <span className="live-dot" aria-hidden="true" />
              <time dateTime={updatedAt.toISOString()} title={clock(updatedAt)}>
                {t('board.updated', { ago: ago(updatedAt, Math.max(now, dataUpdatedAt)) })}
              </time>
            </>
          )}
        </p>
        <div className="toolbar__actions">
          {fresh.size > 0 && (
            <button
              type="button"
              className="btn btn--accent btn--small"
              onClick={() => acknowledge()}
            >
              {t('board.markSeen', { count: fresh.size })}
            </button>
          )}
          {soundBlocked && (
            <button type="button" className="btn btn--warning btn--small" onClick={unlockSound}>
              {t('board.soundUnlock')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--small toggle"
            aria-pressed={soundEnabled}
            title={soundEnabled ? t('board.soundOn') : t('board.soundOff')}
            onClick={toggleSound}
          >
            {soundEnabled ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
            {t('board.sound')}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <IconRefresh size={18} className={isFetching ? 'spin' : undefined} />
            {isFetching ? t('board.refreshing') : t('board.refresh')}
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="state state--empty board__empty">
          <span className="state__icon">
            <IconInbox size={30} />
          </span>
          <h2 tabIndex={-1} ref={focusIfLost}>
            {t('board.emptyTitle')}
          </h2>
          <p>{t('board.emptyBody')}</p>
        </div>
      ) : (
        <>
          <div className="column-switch" role="group" aria-label={t('board.columns')}>
            {BOARD_COLUMNS.map((column) => (
              <button
                key={column.status}
                type="button"
                className={`column-switch__btn column-switch__btn--${column.status}`}
                aria-pressed={mobileColumn === column.status}
                onClick={() => setMobileColumn(column.status)}
              >
                {/* Teléfono: rótulo corto visible (no se parte en 2 líneas a 390 px). */}
                <span aria-hidden="true">{t(column.short)}</span>
                <span className="sr-only">{t(column.title)}</span>
                <span className="count">{ordersInColumn(orders, column.status).length}</span>
              </button>
            ))}
          </div>
          <div className="columns">
            {BOARD_COLUMNS.map((column) => {
              const items = ordersInColumn(orders, column.status);
              const headingId = `column-${column.status}`;
              return (
                <section
                  key={column.status}
                  className={`column column--${column.status}${
                    mobileColumn === column.status ? ' is-current' : ''
                  }`}
                  aria-labelledby={headingId}
                >
                  <header className="column__head">
                    <span className="column__dot" aria-hidden="true" />
                    <h2 id={headingId} tabIndex={-1}>
                      {t(column.title)}
                    </h2>
                    <span className="count" aria-hidden="true">
                      {items.length}
                    </span>
                    <span className="sr-only">{t('orders.count', { count: items.length })}</span>
                  </header>
                  {items.length === 0 ? (
                    <div className="column__empty">
                      <p className="column__empty-title">{t('board.columnEmpty')}</p>
                      <p>{t(column.hint)}</p>
                    </div>
                  ) : (
                    <ol className="column__list">
                      {items.map((order) => (
                        <li key={order.id}>
                          <OrderCard
                            order={order}
                            currency={currency}
                            now={now}
                            isFresh={fresh.has(order.id)}
                            isPending={pendingIds.has(order.id)}
                            onChangeStatus={changeStatus}
                            onSeen={acknowledge}
                          />
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
