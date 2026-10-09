import { TRIAL_DAYS } from '@/config';
import { signupHref, useLocale, useT } from '@/i18n';

import { Isotype, Logo } from './Brand';
import { DEMO_RESTAURANT, DEMO_TOTAL, lempiras } from './food';

/**
 * Sección J — cierre. Marino con el isotipo oficial a gran escala y el último pedido del
 * recorrido ya «Listo» en el tablero: la historia termina donde empezó el hero.
 */
export function FinalCta() {
  const f = useT().final;
  const locale = useLocale();
  return (
    <section className="final" aria-labelledby="final-title">
      <Isotype tone="dark" className="final__mark" />
      <div className="container final__inner">
        <div className="final__copy" data-reveal>
          <Logo tone="dark" className="final__logo" />
          <h2 className="display final__title" id="final-title">
            {f.title} <span>{f.titleAccent}</span>
          </h2>
          <div className="final__actions">
            <a className="btn btn--sun btn--lg" href={signupHref(locale)}>
              {f.primaryCta}
            </a>
            <a className="btn btn--ghost btn--lg" href="#pedir-demo">
              {f.secondaryCta}
            </a>
          </div>
          <p className="final__fine">{f.fine(TRIAL_DAYS)}</p>
        </div>

        <div className="final__ticket" aria-hidden="true" data-reveal>
          <p className="final__ticket-col">{f.column}</p>
          <article className="ticket is-ready">
            <header>
              <strong>#{DEMO_RESTAURANT.orderNumber}</strong>
              <span>{f.takeout}</span>
            </header>
            <p className="ticket__mode">{f.readyForPickup}</p>
            <footer>
              <span>{lempiras(DEMO_TOTAL)}</span>
              <span className="ticket__action">{f.delivered}</span>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}
