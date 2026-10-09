import menuAvif from '@/assets/demo/carolina-menu.avif';
import menuWebp from '@/assets/demo/carolina-menu.webp';
import profileAvif from '@/assets/demo/carolina-profile.avif';
import profileWebp from '@/assets/demo/carolina-profile.webp';
import { useT } from '@/i18n';

/**
 * Sección G — la diferencia, con el producto real: capturas de la app de Carolina Hot Chicken,
 * la primera marca en Ventea (menú y perfil con puntos; el correo de la cuenta de prueba está
 * tapado). Sin testimonios ni cifras.
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
          <div className="shot shot--menu">
            <picture>
              <source srcSet={menuAvif} type="image/avif" />
              <img
                src={menuWebp}
                width={520}
                height={1126}
                alt={id.menuAlt}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <div className="shot shot--profile">
            <picture>
              <source srcSet={profileAvif} type="image/avif" />
              <img
                src={profileWebp}
                width={520}
                height={480}
                alt={id.profileAlt}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <figcaption>{id.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
