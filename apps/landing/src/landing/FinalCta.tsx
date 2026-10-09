import { TRIAL_DAYS } from '@/config';

import { Isotype, Logo } from './Brand';
import { DEMO_RESTAURANT, DEMO_TOTAL, lempiras } from './food';

/**
 * Sección J — cierre. Marino con el isotipo oficial a gran escala y el último pedido del
 * recorrido ya «Listo» en el tablero: la historia termina donde empezó el hero.
 */
export function FinalCta() {
  return (
    <section className="final" aria-labelledby="final-title">
      <Isotype tone="dark" className="final__mark" />
      <div className="container final__inner">
        <div className="final__copy" data-reveal>
          <Logo tone="dark" className="final__logo" />
          <h2 className="display final__title" id="final-title">
            Su restaurante tiene una marca. <span>Es hora de llevarla más lejos.</span>
          </h2>
          <div className="final__actions">
            <a className="btn btn--sun btn--lg" href="/registro">
              Empezar con Ventea
            </a>
            <a className="btn btn--ghost btn--lg" href="#pedir-demo">
              Pedir una demostración
            </a>
          </div>
          <p className="final__fine">
            {TRIAL_DAYS} días gratis · Sin tarjeta · 0% de comisión por pedido
          </p>
        </div>

        <div className="final__ticket" aria-hidden="true" data-reveal>
          <p className="final__ticket-col">Listos</p>
          <article className="ticket is-ready">
            <header>
              <strong>#{DEMO_RESTAURANT.orderNumber}</strong>
              <span>Para llevar</span>
            </header>
            <p className="ticket__mode">Listo para retirar</p>
            <footer>
              <span>{lempiras(DEMO_TOTAL)}</span>
              <span className="ticket__action">Entregado</span>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}
