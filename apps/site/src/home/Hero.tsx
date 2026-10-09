import type { Dict } from '@/i18n';
import { sectionHref } from '@/links';

import { HeroArt } from './HeroArt';
import { openService } from './projectTypeEvent';

/**
 * Hero: texto y CTAs en el HTML prerenderizado (son el LCP y funcionan sin JS); la composición
 * SVG se ensambla con CSS al cargar.
 */
export function Hero({ t }: { t: Dict }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__bg" aria-hidden="true">
        <img
          className="hero__mark"
          src="/brand/isotipo-white.svg"
          alt=""
          width="905"
          height="670"
          decoding="async"
        />
      </div>
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="eyebrow eyebrow--dark hero__eyebrow">{t.hero.eyebrow}</p>
          <h1 id="hero-title" className="hero__title">
            {t.hero.title}
          </h1>
          <p className="hero__lead">{t.hero.lead}</p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--lg" href={sectionHref(t.locale, 'contact')}>
              {t.hero.primary}
              <span aria-hidden="true">→</span>
            </a>
            <a className="btn btn--ghost btn--lg" href={sectionHref(t.locale, 'solutions')}>
              {t.hero.secondary}
            </a>
          </div>
        </div>
        <div className="hero__art">
          <HeroArt t={t} />
          <p className="hero__tagline" aria-hidden="true">
            {t.hero.tagline}
          </p>
        </div>
      </div>
      <div className="container">
        <ol className="hero__index">
          {t.services.items.map((service, index) => (
            <li key={service.id}>
              <a href={sectionHref(t.locale, 'services')} onClick={() => openService(service.id)}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {service.title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
