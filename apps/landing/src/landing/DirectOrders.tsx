import { useRef } from 'react';

import { useT } from '@/i18n';

import { useInView, useReducedMotion } from './motion';
import { PanelShot, ShotPhone } from './shots';

/**
 * Sección C — el pedido va del teléfono del cliente al tablero del restaurante, con capturas
 * reales (TASK-013): el estado del pedido en la app de Carolina y el tablero del panel (Nuevos,
 * En cocina, Listos) en el idioma de la página. El paquete recorre el cable una vez al entrar en
 * pantalla; con movimiento reducido no se anima.
 */
export function DirectOrders() {
  const d = useT().direct;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, 0.4);
  const reduced = useReducedMotion();

  return (
    <section className="section direct" id="pedidos" aria-labelledby="direct-title">
      <div className="container">
        <header className="section__head direct__head" data-reveal>
          <p className="eyebrow">{d.eyebrow}</p>
          <h2 className="display section__title" id="direct-title">
            {d.title}
          </h2>
          <p className="section__lead">{d.lead}</p>
        </header>

        <div
          className={`direct__scene${seen && !reduced ? ' is-live' : ''}`}
          data-phase={0}
          ref={ref}
        >
          <ShotPhone screens={['tracking']} className="direct__phone" />

          <div className="direct__wire" aria-hidden="true">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none">
              <path d="M0 20 C 60 20, 60 20, 100 20 S 160 20, 200 20" />
            </svg>
            <span className="direct__packet" />
          </div>

          <figure className="browser direct__board">
            <div className="browser__bar" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <PanelShot view="board" />
          </figure>
        </div>

        <ul className="direct__facts" data-reveal>
          {d.facts.map((fact) => (
            <li key={fact.strong}>
              <strong>{fact.strong}</strong> {fact.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
