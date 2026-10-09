import { DEMO_RESTAURANT, DishPhoto } from './food';

/**
 * Sección A — por qué un canal propio. Sin nombrar a nadie y sin decir que las apps de
 * terceros sobran: sirven para que lo descubran; el canal propio es para los que vuelven.
 */
export function OwnBrand() {
  return (
    <section className="section own" id="beneficio" aria-labelledby="own-title">
      <div className="container own__inner">
        <header className="own__head" data-reveal>
          <p className="eyebrow">Identidad propia</p>
          <h2 className="display own__title" id="own-title">
            Su marca merece algo más que aparecer en una app de terceros.
          </h2>
          <p className="section__lead">
            Las apps de terceros pueden ayudarle a que clientes nuevos lo descubran. Ventea es el
            canal para quienes ya lo conocen: un menú y un pedido con su nombre, su propia dirección
            en ventea.tech y su propio programa de puntos.
          </p>
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
              <strong>En una app de terceros</strong>
              Su restaurante es una opción más en una lista, con la marca de la app.
            </figcaption>
          </figure>

          <figure className="own__panel own__panel--own" data-reveal>
            <div className="ownapp" aria-hidden="true">
              <div className="ownapp__url">
                <span className="ownapp__lock" /> App de {DEMO_RESTAURANT.name}
              </div>
              <div className="ownapp__hero">
                <DishPhoto dish="chicken" sizes="(min-width: 768px) 280px, 70vw" />
                <span className="ownapp__brand">
                  <span className="ownapp__logo">{DEMO_RESTAURANT.initials}</span>
                  {DEMO_RESTAURANT.name}
                </span>
              </div>
              <div className="ownapp__row">
                <span>Menú</span>
                <span>Mis pedidos</span>
                <span className="is-on">★ Mis puntos</span>
              </div>
            </div>
            <figcaption>
              <strong>En su canal propio</strong>
              Su nombre, sus fotos y sus colores de principio a fin. El cliente le pide a usted.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
