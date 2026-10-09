import { useRef, type CSSProperties } from 'react';

import { useT } from '@/i18n';

import { DEMO_BALANCE, DEMO_EARNED, DEMO_RESTAURANT, DEMO_TOTAL, lempiras, REWARDS } from './food';
import { useInView } from './motion';

/**
 * Sección D — puntos. Los números salen de la configuración inicial real de cada marca
 * (DEFAULT_REWARD_PROGRAM): nada de recompensas inventadas. El anillo se llena una vez al
 * entrar en pantalla (CSS; con movimiento reducido aparece lleno).
 */
export function Loyalty() {
  const l = useT().loyalty;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.4);
  const value = (DEMO_BALANCE * REWARDS.centsPerPoint) / 100;

  return (
    <section className="section loyalty" id="puntos" aria-labelledby="loyalty-title">
      <div className="container loyalty__inner">
        <div className="loyalty__copy" data-reveal>
          <p className="eyebrow eyebrow--on-dark">{l.eyebrow}</p>
          <h2 className="display section__title" id="loyalty-title">
            {l.title}
          </h2>
          <p className="section__lead">{l.lead}</p>

          <dl className="rules">
            <div>
              <dt>{l.earnTerm}</dt>
              <dd>{l.earnDef}</dd>
            </div>
            <div>
              <dt>{l.welcomeTerm}</dt>
              <dd>{l.welcomeDef(REWARDS.welcomeBonus)}</dd>
            </div>
            <div>
              <dt>{l.redeemTerm}</dt>
              <dd>{l.redeemDef(REWARDS.minToRedeem)}</dd>
            </div>
          </dl>
          <p className="loyalty__note">{l.note}</p>
        </div>

        <div
          className={`loyalty__card${seen ? ' is-in' : ''}`}
          ref={ref}
          role="img"
          aria-label={l.cardLabel(lempiras(DEMO_TOTAL), DEMO_BALANCE, lempiras(value))}
        >
          <div className="ring" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <circle className="ring__track" cx="60" cy="60" r="52" />
              <circle className="ring__fill" cx="60" cy="60" r="52" pathLength="100" />
            </svg>
            <span className="ring__value">
              <strong>{DEMO_BALANCE}</strong>
              <small>{l.points}</small>
            </span>
          </div>
          <ul className="ledger" aria-hidden="true">
            <li style={{ '--d': '0.2s' } as CSSProperties}>
              <span>{l.welcomeBonus}</span>
              <strong>+{REWARDS.welcomeBonus}</strong>
            </li>
            <li style={{ '--d': '0.6s' } as CSSProperties}>
              <span>{l.order(DEMO_RESTAURANT.orderNumber, lempiras(DEMO_TOTAL))}</span>
              <strong>+{DEMO_EARNED}</strong>
            </li>
            <li className="ledger__total" style={{ '--d': '1s' } as CSSProperties}>
              <span>{l.available}</span>
              <strong>{lempiras(value)}</strong>
            </li>
          </ul>
          <p className="loyalty__example">{l.example}</p>
        </div>
      </div>
    </section>
  );
}
