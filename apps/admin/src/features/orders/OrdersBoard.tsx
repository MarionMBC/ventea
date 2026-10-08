import { useState } from 'react';

import { formatClock } from '@/lib/format';

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

/**
 * Tablero del mostrador: tres columnas (Nuevos, En cocina, Listos) lado a lado desde
 * 768 px; en teléfono, una columna a la vez con un selector arriba.
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
  const pendingIds = usePendingOrderIds();
  const now = useNow();
  const [mobileColumn, setMobileColumn] = useState<BoardStatus>('confirmed');
  const { data: orders, error, isPending, isFetching, refetch, dataUpdatedAt } = activeOrders;

  if (isPending) {
    return (
      <p className="state state--loading" role="status">
        Cargando pedidos…
      </p>
    );
  }

  if (!orders) {
    return (
      <div className="state state--error" role="alert">
        <h2>No pudimos cargar los pedidos</h2>
        <p>{error?.message}</p>
        <button type="button" className="btn btn--primary" onClick={() => void refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <section className="board" aria-label="Pedidos activos">
      <div className="toolbar">
        <p className="toolbar__updated">
          {error ? (
            <span className="toolbar__stale" role="alert">
              Sin conexión. Datos de las {formatClock(new Date(dataUpdatedAt))}
            </span>
          ) : (
            <>Actualizado {formatClock(new Date(dataUpdatedAt))}</>
          )}
        </p>
        <div className="toolbar__actions">
          {fresh.size > 0 && (
            <button type="button" className="btn btn--accent" onClick={() => acknowledge()}>
              Marcar vistos ({fresh.size})
            </button>
          )}
          {soundBlocked && (
            <button type="button" className="btn btn--warning" onClick={unlockSound}>
              Toca para activar el sonido
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            aria-pressed={soundEnabled}
            onClick={toggleSound}
          >
            {soundEnabled ? 'Sonido: activado' : 'Sonido: apagado'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="state state--empty">
          <h2 tabIndex={-1} ref={focusIfLost}>
            No hay pedidos activos
          </h2>
          <p>Los pedidos nuevos aparecen aquí solos.</p>
        </div>
      ) : (
        <>
          <div className="column-switch" role="group" aria-label="Columna a mostrar">
            {BOARD_COLUMNS.map((column) => (
              <button
                key={column.status}
                type="button"
                className="column-switch__btn"
                aria-pressed={mobileColumn === column.status}
                onClick={() => setMobileColumn(column.status)}
              >
                {column.title}
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
                    <h2 id={headingId} tabIndex={-1}>
                      {column.title}
                    </h2>
                    <span className="count" aria-hidden="true">
                      {items.length}
                    </span>
                    <span className="sr-only">
                      {items.length} {items.length === 1 ? 'pedido' : 'pedidos'}
                    </span>
                  </header>
                  {items.length === 0 ? (
                    <p className="column__empty">Sin pedidos</p>
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
