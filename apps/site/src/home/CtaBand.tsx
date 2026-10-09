import type { Dict } from '@/i18n';
import { sectionHref } from '@/links';

/** CTA de conversión en navy, con el isotipo oficial como marca de agua (archivo sin modificar). */
export function CtaBand({ t }: { t: Dict }) {
  return (
    <section className="cta-band" aria-labelledby="cta-title">
      <img
        className="cta-band__mark"
        src="/brand/isotipo-white.svg"
        alt=""
        width="905"
        height="670"
        loading="lazy"
        decoding="async"
      />
      <div className="container cta-band__inner" data-reveal>
        <p className="eyebrow eyebrow--dark">{t.cta.eyebrow}</p>
        <h2 id="cta-title" className="cta-band__title">
          {t.cta.title}
        </h2>
        <p className="cta-band__text">{t.cta.text}</p>
        <a className="btn btn--light btn--lg" href={sectionHref(t.locale, 'contact')}>
          {t.cta.button}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
