import { useT } from '@/i18n';

import { ShotPhone } from './shots';

/**
 * Sección G — la diferencia, con el producto real: capturas de la app de Carolina Hot Chicken,
 * la primera marca en Ventea (menú real desde la API y detalle de un platillo; TASK-013). Sin testimonios ni cifras.
 */
export function Identity() {
  const id = useT().identity;
  return (
    <section className="section identity" id="identidad" aria-labelledby="identity-title">
      <div className="container identity__inner">
        <div className="identity__copy">
          <header data-reveal>
            <p className="eyebrow">{id.eyebrow}</p>
            <h2 className="display section__title" id="identity-title">
              {id.title}
            </h2>
          </header>
          <ol className="pillars">
            {id.pillars.map((pillar, index) => (
              <li key={pillar.title} data-reveal>
                <span className="pillars__n" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </li>
            ))}
          </ol>
        </div>

        <figure className="identity__shots" data-reveal>
          <ShotPhone screens={['menu']} className="shot shot--menu" />
          <ShotPhone screens={['product']} className="shot shot--profile" />
          <figcaption>{id.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
