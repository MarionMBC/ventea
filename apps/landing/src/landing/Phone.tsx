import type { CSSProperties } from 'react';

import { useT, type Messages } from '@/i18n';

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

/** Descripción accesible de cada pantalla, en el idioma de la vista. */
export function screenLabel(screen: PhoneScreen, t: Messages): string {
  const l = t.phone.screenLabel;
  switch (screen) {
    case 'menu':
      return l.menu;
    case 'cart':
      return l.cart(lempiras(DEMO_TOTAL), DEMO_EARNED);
    case 'confirmed':
      return l.confirmed(DEMO_RESTAURANT.orderNumber);
    case 'points':
      return l.points(DEMO_BALANCE, REWARDS.welcomeBonus, DEMO_EARNED);
  }
}

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
  const t = useT();
  const p = t.phone;
  const active = ORDER.indexOf(screen);
  const state = (s: PhoneScreen) => {
    const i = ORDER.indexOf(s);
    return i === active ? 'is-active' : i < active ? 'is-past' : 'is-next';
  };

  return (
    <div className={`phone ${className}`} role="img" aria-label={screenLabel(screen, t)}>
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
            <small>{p.modes}</small>
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
              <span className="is-on">{p.chips[0]}</span>
              <span>{p.chips[1]}</span>
              <span>{p.chips[2]}</span>
            </div>
            <ul className="pmenu">
              {DEMO_MENU.map((item, index) => (
                <li
                  key={item.dish}
                  className={`pmenu__item${added && index < 2 ? ' is-added' : ''}`}
                  style={{ '--i': index } as CSSProperties}
                >
                  <DishPhoto dish={item.dish} sizes="64px" eager={eager} className="pmenu__photo" />
                  <span className="pmenu__text">
                    <strong>{t.menu[item.dish].name}</strong>
                    <small>{t.menu[item.dish].detail}</small>
                    <em>{lempiras(item.price)}</em>
                  </span>
                  <span className="pmenu__add">{added && index < 2 ? '✓' : '+'}</span>
                </li>
              ))}
            </ul>
            <div className="pscreen__points-chip">
              <span>★</span> {p.welcomeChip(REWARDS.welcomeBonus)}
            </div>
          </section>

          {/* Carrito */}
          <section className={`pscreen pscreen--cart ${state('cart')}`}>
            <p className="pscreen__title">{p.cartTitle}</p>
            <ul className="pcart">
              {DEMO_ORDER.map((item) => (
                <li key={item.dish}>
                  <DishPhoto dish={item.dish} sizes="44px" eager={eager} className="pcart__photo" />
                  <span>1 × {t.menu[item.dish].name}</span>
                  <em>{lempiras(item.price)}</em>
                </li>
              ))}
            </ul>
            <div className="pcart__mode">
              <span className="is-on">{p.takeout}</span>
              <span>{p.dineIn}</span>
            </div>
            <p className="pcart__pay">{p.payAtPickup}</p>
            <div className="pcart__total">
              <span>{p.total}</span>
              <strong>{lempiras(DEMO_TOTAL)}</strong>
            </div>
            <p className="pcart__earn">
              <span>★</span> {p.earn(DEMO_EARNED)}
            </p>
            <span className="pscreen__cta">{p.confirm}</span>
          </section>

          {/* Pedido recibido */}
          <section className={`pscreen pscreen--confirmed ${state('confirmed')}`}>
            <span className="pconfirm__check">
              <svg viewBox="0 0 24 24">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <p className="pscreen__title">{track === 2 ? p.readyForPickup : p.received}</p>
            <p className="pconfirm__num">#{DEMO_RESTAURANT.orderNumber}</p>
            <ol className="ptrack">
              {p.track.map((label, index) => (
                <li key={label} className={index <= track ? 'is-done' : undefined}>
                  {label}
                </li>
              ))}
            </ol>
            <p className="pconfirm__note">{p.trackNote}</p>
          </section>

          {/* Puntos */}
          <section className={`pscreen pscreen--points ${state('points')}`}>
            <p className="ppoints__label">{p.pointsLabel}</p>
            <p className="ppoints__value">{DEMO_BALANCE}</p>
            <div className="ppoints__bar">
              <span style={{ width: '100%' }} />
            </div>
            <p className="ppoints__hint">{p.pointsHint}</p>
            <ul className="pledger">
              <li>
                <span>{p.ledgerOrder(DEMO_RESTAURANT.orderNumber)}</span>
                <strong>+{DEMO_EARNED}</strong>
              </li>
              <li>
                <span>{p.welcomeBonus}</span>
                <strong>+{REWARDS.welcomeBonus}</strong>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
