import { useT } from '@/i18n';

import { DEMO_RESTAURANT, DishPhoto } from './food';

/**
 * Sección A — por qué un canal propio. Sin nombrar a nadie y sin decir que las apps de
 * terceros sobran: sirven para que lo descubran; el canal propio es para los que vuelven.
 */
export function OwnBrand() {
  const o = useT().ownBrand;
  return (
    <section className="section own" id="beneficio" aria-labelledby="own-title">
      <div className="container own__inner">
        <header className="own__head" data-reveal>
          <p className="eyebrow">{o.eyebrow}</p>
          <h2 className="display own__title" id="own-title">
            {o.title}
          </h2>
          <p className="section__lead">{o.lead}</p>
        </header>

        <div className="own__compare">
          <figure className="own__panel own__panel--crowd" data-reveal>
            <div className="crowd" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className={`crowd__tile${i === 4 ? ' is-you' : ''}`}>
                  {i === 4 ? DEMO_RESTAURANT.initials : ''}
                </span>
              ))}
            </div>
            <figcaption>
              <strong>{o.crowdTitle}</strong>
              {o.crowdText}
            </figcaption>
          </figure>

          <figure className="own__panel own__panel--own" data-reveal>
            <div className="ownapp" aria-hidden="true">
              <div className="ownapp__url">
                <span className="ownapp__lock" /> {o.ownUrl(DEMO_RESTAURANT.name)}
              </div>
              <div className="ownapp__hero">
                <DishPhoto dish="chicken" sizes="(min-width: 768px) 280px, 70vw" />
                <span className="ownapp__brand">
                  <span className="ownapp__logo">{DEMO_RESTAURANT.initials}</span>
                  {DEMO_RESTAURANT.name}
                </span>
              </div>
              <div className="ownapp__row">
                <span>{o.ownTabs[0]}</span>
                <span>{o.ownTabs[1]}</span>
                <span className="is-on">{o.ownTabs[2]}</span>
              </div>
            </div>
            <figcaption>
              <strong>{o.ownTitle}</strong>
              {o.ownText}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
