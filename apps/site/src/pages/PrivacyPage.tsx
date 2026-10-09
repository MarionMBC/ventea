import { config } from '@/config';
import type { Dict } from '@/i18n';
import { PATHS } from '@/routes';

/** Política de privacidad del sitio corporativo (no de los productos: esos tienen la suya). */
export function PrivacyPage({ t }: { t: Dict }) {
  const p = t.privacy;
  return (
    <article className="page" aria-labelledby="page-title">
      <div className="container page__inner prose">
        <p className="eyebrow">{p.eyebrow}</p>
        <h1 id="page-title" className="page__title">
          {p.title}
        </h1>
        <p className="page__lead">{p.lead}</p>
        {p.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <section>
          <h2>{p.productTitle}</h2>
          <p>
            {p.productText}{' '}
            <a href={config.restaurantsPrivacyUrl}>
              {config.restaurantsPrivacyUrl.replace('https://', '')}
            </a>
            .
          </p>
        </section>
        <p>
          <a className="link-arrow link-arrow--back" href={PATHS.home[t.locale]}>
            <span aria-hidden="true">←</span>
            {p.back}
          </a>
        </p>
      </div>
    </article>
  );
}
