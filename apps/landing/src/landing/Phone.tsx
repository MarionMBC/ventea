import type { CSSProperties } from 'react';

import {
  DEMO_BALANCE,
  DEMO_EARNED,
  DEMO_MENU,
  DEMO_ORDER,
  DEMO_RESTAURANT,
  DEMO_TOTAL,
  DishPhoto,
  lempiras,
  REWARDS,
} from './food';

/**
 * Teléfono con la experiencia del cliente del restaurante de ejemplo, en HTML/CSS (sin
 * capturas: se ve nítido en cualquier pantalla y pesa poco). Recorre lo que el producto hace de
 * verdad: menú con fotos y precios, pedido para llevar con pago al retirar, el pedido recibido
 * con sus estados, y los puntos ganados. Las pantallas se apilan y la activa entra con una
 * transición; el conjunto se anuncia como una imagen con su descripción.
 */
export type PhoneScreen = 'menu' | 'cart' | 'confirmed' | 'points';

export const SCREEN_LABEL: Record<PhoneScreen, string> = {
  menu: 'Menú del restaurante de ejemplo con fotos y precios en lempiras',
  cart: `Pedido para llevar con pago al retirar, total ${lempiras(DEMO_TOTAL)} y ${DEMO_EARNED} puntos por ganar`,
  confirmed: `Pedido ${DEMO_RESTAURANT.orderNumber} recibido, en estado Nuevo`,
  points: `Saldo de ${DEMO_BALANCE} puntos: ${REWARDS.welcomeBonus} de bienvenida y ${DEMO_EARNED} del pedido`,
};

const ORDER: PhoneScreen[] = ['menu', 'cart', 'confirmed', 'points'];

export function Phone({
  screen,
  added = screen !== 'menu',
  track = 0,
  eager = false,
  className = '',
}: {
  screen: PhoneScreen;
  /** En el menú: la hamburguesa ya está en el carrito (badge y botón marcado). */
  added?: boolean;
  /** Pantalla «recibido»: estado alcanzado (0 Nuevo · 1 En cocina · 2 Listo). */
  track?: 0 | 1 | 2;
  eager?: boolean;
  className?: string;
}) {
  const active = ORDER.indexOf(screen);
  const state = (s: PhoneScreen) => {
    const i = ORDER.indexOf(s);
    return i === active ? 'is-active' : i < active ? 'is-past' : 'is-next';
  };

  return (
    <div className={`phone ${className}`} role="img" aria-label={SCREEN_LABEL[screen]}>
      <div className="phone__frame" aria-hidden="true">
        <div className="phone__island" />
        <div className="phone__status">
          <span>9:41</span>
          <span className="phone__signal" />
        </div>
        <div className="phone__bar">
          <span className="phone__avatar">{DEMO_RESTAURANT.initials}</span>
          <span className="phone__who">
            <strong>{DEMO_RESTAURANT.name}</strong>
            <small>Para llevar · Comer aquí</small>
          </span>
          <span className={`phone__bag${added ? ' has-items' : ''}`}>
            <svg viewBox="0 0 24 24">
              <path d="M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 0 1 6 0v2" />
            </svg>
            <span className="phone__bag-count">{added ? DEMO_ORDER.length : 0}</span>
          </span>
        </div>

        <div className="phone__screens">
          {/* Menú */}
          <section className={`pscreen pscreen--menu ${state('menu')}`}>
            <div className="pscreen__chips">
              <span className="is-on">Populares</span>
              <span>Hamburguesas</span>
              <span>Tacos</span>
            </div>
            <ul className="pmenu">
              {DEMO_MENU.map((item, index) => (
                <li
                  key={item.name}
                  className={`pmenu__item${added && index < 2 ? ' is-added' : ''}`}
                  style={{ '--i': index } as CSSProperties}
                >
                  <DishPhoto dish={item.dish} sizes="64px" eager={eager} className="pmenu__photo" />
                  <span className="pmenu__text">
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                    <em>{lempiras(item.price)}</em>
                  </span>
                  <span className="pmenu__add">{added && index < 2 ? '✓' : '+'}</span>
                </li>
              ))}
            </ul>
            <div className="pscreen__points-chip">
              <span>★</span> {REWARDS.welcomeBonus} puntos de bienvenida
            </div>
          </section>

          {/* Carrito */}
          <section className={`pscreen pscreen--cart ${state('cart')}`}>
            <p className="pscreen__title">Su pedido</p>
            <ul className="pcart">
              {DEMO_ORDER.map((item) => (
                <li key={item.name}>
                  <DishPhoto dish={item.dish} sizes="44px" eager={eager} className="pcart__photo" />
                  <span>1 × {item.name}</span>
                  <em>{lempiras(item.price)}</em>
                </li>
              ))}
            </ul>
            <div className="pcart__mode">
              <span className="is-on">Para llevar</span>
              <span>Comer aquí</span>
            </div>
            <p className="pcart__pay">Paga al retirar en el local</p>
            <div className="pcart__total">
              <span>Total</span>
              <strong>{lempiras(DEMO_TOTAL)}</strong>
            </div>
            <p className="pcart__earn">
              <span>★</span> Gana {DEMO_EARNED} puntos con este pedido
            </p>
            <span className="pscreen__cta">Confirmar pedido</span>
          </section>

          {/* Pedido recibido */}
          <section className={`pscreen pscreen--confirmed ${state('confirmed')}`}>
            <span className="pconfirm__check">
              <svg viewBox="0 0 24 24">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <p className="pscreen__title">
              {track === 2 ? '¡Listo para retirar!' : '¡Pedido recibido!'}
            </p>
            <p className="pconfirm__num">#{DEMO_RESTAURANT.orderNumber}</p>
            <ol className="ptrack">
              {(['Nuevo', 'En cocina', 'Listo'] as const).map((label, index) => (
                <li key={label} className={index <= track ? 'is-done' : undefined}>
                  {label}
                </li>
              ))}
            </ol>
            <p className="pconfirm__note">Siga el estado de su pedido desde aquí.</p>
          </section>

          {/* Puntos */}
          <section className={`pscreen pscreen--points ${state('points')}`}>
            <p className="ppoints__label">Sus puntos</p>
            <p className="ppoints__value">{DEMO_BALANCE}</p>
            <div className="ppoints__bar">
              <span style={{ width: '100%' }} />
            </div>
            <p className="ppoints__hint">Ya puede canjearlos en su próximo pedido</p>
            <ul className="pledger">
              <li>
                <span>Pedido #{DEMO_RESTAURANT.orderNumber}</span>
                <strong>+{DEMO_EARNED}</strong>
              </li>
              <li>
                <span>Bono de bienvenida</span>
                <strong>+{REWARDS.welcomeBonus}</strong>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
