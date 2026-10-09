import { config } from '@/config';
import type { Dict } from '@/i18n';
import { PATHS } from '@/routes';

export function NotFoundPage({ t }: { t: Dict }) {
  const n = t.notFound;
  return (
    <section className="page page--center" aria-labelledby="page-title">
      <div className="container page__inner">
        <p className="eyebrow">{n.eyebrow}</p>
        <h1 id="page-title" className="page__title">
          {n.title}
        </h1>
        <p className="page__lead">
          {n.text} {n.productText}{' '}
          <a href={config.restaurantsUrl}>{config.restaurantsUrl.replace('https://', '')}</a>.
        </p>
        <p>
          <a className="btn btn--primary" href={PATHS.home[t.locale]}>
            {n.back}
          </a>
        </p>
      </div>
    </section>
  );
}
