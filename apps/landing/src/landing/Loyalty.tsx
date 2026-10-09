import { useRef, type CSSProperties } from 'react';

import { DEMO_BALANCE, DEMO_EARNED, DEMO_RESTAURANT, DEMO_TOTAL, lempiras, REWARDS } from './food';
import { useInView } from './motion';

/**
 * Sección D — puntos. Los números salen de la configuración inicial real de cada marca
 * (DEFAULT_REWARD_PROGRAM): nada de recompensas inventadas. El anillo se llena una vez al
 * entrar en pantalla (CSS; con movimiento reducido aparece lleno).
 */
export function Loyalty() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.4);
  const value = (DEMO_BALANCE * REWARDS.centsPerPoint) / 100;

  return (
    <section className="section loyalty" id="puntos" aria-labelledby="loyalty-title">
      <div className="container loyalty__inner">
        <div className="loyalty__copy" data-reveal>
          <p className="eyebrow eyebrow--on-dark">Programa de puntos</p>
          <h2 className="display section__title" id="loyalty-title">
            Convierta una buena experiencia en otra visita.
          </h2>
          <p className="section__lead">
            Sus clientes suman puntos con cada pedido entregado y los canjean como descuento en el
            siguiente. Ven su saldo y de dónde salió cada punto.
          </p>

          <dl className="rules">
            <div>
              <dt>Gana</dt>
              <dd>1 punto por cada lempira del pedido</dd>
            </div>
            <div>
              <dt>Bienvenida</dt>
              <dd>{REWARDS.welcomeBonus} puntos al crear su cuenta</dd>
            </div>
            <div>
              <dt>Canjea</dt>
              <dd>Desde {REWARDS.minToRedeem} puntos; cada punto vale 1 centavo</dd>
            </div>
          </dl>
          <p className="loyalty__note">
            Son los valores con los que arranca cada restaurante. Si quiere otros, los ajustamos con
            usted.
          </p>
        </div>

        <div
          className={`loyalty__card${seen ? ' is-in' : ''}`}
          ref={ref}
          role="img"
          aria-label={`Ejemplo: con un pedido de ${lempiras(DEMO_TOTAL)} y el bono de bienvenida, el cliente reúne ${DEMO_BALANCE} puntos, que equivalen a ${lempiras(value)} de descuento.`}
        >
          <div className="ring" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <circle className="ring__track" cx="60" cy="60" r="52" />
              <circle className="ring__fill" cx="60" cy="60" r="52" pathLength="100" />
            </svg>
            <span className="ring__value">
              <strong>{DEMO_BALANCE}</strong>
              <small>puntos</small>
            </span>
          </div>
          <ul className="ledger" aria-hidden="true">
            <li style={{ '--d': '0.2s' } as CSSProperties}>
              <span>Bono de bienvenida</span>
              <strong>+{REWARDS.welcomeBonus}</strong>
            </li>
            <li style={{ '--d': '0.6s' } as CSSProperties}>
              <span>
                Pedido #{DEMO_RESTAURANT.orderNumber} · {lempiras(DEMO_TOTAL)}
              </span>
              <strong>+{DEMO_EARNED}</strong>
            </li>
            <li className="ledger__total" style={{ '--d': '1s' } as CSSProperties}>
              <span>Descuento disponible</span>
              <strong>{lempiras(value)}</strong>
            </li>
          </ul>
          <p className="loyalty__example">Ejemplo con la configuración inicial.</p>
        </div>
      </div>
    </section>
  );
}
