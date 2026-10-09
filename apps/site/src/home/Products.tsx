import type { ReactNode } from 'react';

import kitchenAvif from '@/assets/products/carolina-kitchen.avif';
import kitchenWebp from '@/assets/products/carolina-kitchen.webp';
import menuAvif from '@/assets/products/carolina-menu.avif';
import menuWebp from '@/assets/products/carolina-menu.webp';
import marketingAvif from '@/assets/products/ventea-marketing.avif';
import marketingWebp from '@/assets/products/ventea-marketing.webp';
import { config } from '@/config';
import type { Dict } from '@/i18n';

interface PictureProps {
  avif: string;
  webp: string;
  width: number;
  height: number;
  alt: string;
  sizes: string;
}

/** Captura real con tamaño fijo (sin saltos de layout) y carga diferida: están bajo el pliegue. */
function Picture({ avif, webp, width, height, alt, sizes }: PictureProps) {
  return (
    <picture>
      <source srcSet={avif} type="image/avif" sizes={sizes} />
      <img
        src={webp}
        width={width}
        height={height}
        alt={alt}
        sizes={sizes}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="frame frame--browser">
      <div className="frame__bar" aria-hidden="true">
        <span className="frame__dots" />
        <span className="frame__url">{url}</span>
      </div>
      {children}
    </div>
  );
}

function External({
  href,
  children,
  className,
  t,
}: {
  href: string;
  children: ReactNode;
  className: string;
  t: Dict;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener">
      {children}
      <span className="sr-only"> {t.a11y.newTab}</span>
      <span aria-hidden="true" className="ext">
        ↗
      </span>
    </a>
  );
}

/**
 * Soluciones y productos: solo productos reales de Ventea, con hechos verificados (Ventea Marketing:
 * brand-research, fuente marketing.ventea.tech) y capturas reales.
 */
export function Products({ t }: { t: Dict }) {
  const m = t.products.marketing;
  const r = t.products.restaurants;
  return (
    <section className="section products" id={t.anchors.solutions} aria-labelledby="products-title">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="eyebrow">
            <span className="eyebrow__num">04</span>
            {t.products.eyebrow}
          </p>
          <h2 id="products-title" className="section-title">
            {t.products.title}
          </h2>
          <p className="section-lead">{t.products.lead}</p>
        </header>

        <article className="product" aria-labelledby="product-marketing">
          <div className="product__copy" data-reveal>
            <p className="product__kicker">{m.kicker}</p>
            <h3 id="product-marketing" className="product__name">
              {m.name}
            </h3>
            <p className="product__summary">{m.summary}</p>
            {m.languageNote ? <p className="product__note">{m.languageNote}</p> : null}
            <ul className="product__features">
              {m.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="product__actions">
              <External className="btn btn--primary" href={config.marketingUrl} t={t}>
                {m.cta}
              </External>
              <External className="link-arrow" href={config.marketingPricingUrl} t={t}>
                {m.pricingCta}
              </External>
            </div>
          </div>
          <div className="product__media" data-reveal>
            <figure className="shot">
              <BrowserFrame url="marketing.ventea.tech">
                <Picture
                  avif={marketingAvif}
                  webp={marketingWebp}
                  width={1200}
                  height={642}
                  alt={m.shot.alt}
                  sizes="(min-width: 1080px) 620px, 100vw"
                />
              </BrowserFrame>
              <figcaption>{m.shot.caption}</figcaption>
            </figure>
            <div className="product__flow">
              <p className="product__label">{m.flowTitle}</p>
              <ol>
                {m.flow.map((step, index) => (
                  <li key={step}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div className="plans">
              <p className="product__label">{m.plansTitle}</p>
              <ul className="plans__list">
                {m.plans.map((plan) => (
                  <li key={plan.name}>
                    <span className="plans__name">{plan.name}</span>
                    <span className="plans__price">{plan.price}</span>
                    <span className="plans__detail">{plan.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="plans__note">{m.plansNote}</p>
            </div>
          </div>
        </article>

        <article className="product product--alt" aria-labelledby="product-restaurants">
          <div className="product__copy" data-reveal>
            <p className="product__kicker">{r.kicker}</p>
            <h3 id="product-restaurants" className="product__name">
              {r.name}
            </h3>
            <p className="product__summary">{r.summary}</p>
            {r.languageNote ? <p className="product__note">{r.languageNote}</p> : null}
            <ul className="product__features">
              {r.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="product__actions">
              <External className="btn btn--primary" href={config.restaurantsUrl[t.locale]} t={t}>
                {r.cta}
              </External>
            </div>
          </div>
          <div className="product__media product__media--duo" data-reveal>
            <figure className="shot shot--wide">
              <BrowserFrame url="app.ventea.tech">
                <Picture
                  avif={kitchenAvif}
                  webp={kitchenWebp}
                  width={1200}
                  height={522}
                  alt={r.kitchen.alt}
                  sizes="(min-width: 1080px) 620px, 100vw"
                />
              </BrowserFrame>
              <figcaption>{r.kitchen.caption}</figcaption>
            </figure>
            <figure className="shot shot--phone">
              <div className="frame frame--phone">
                <Picture
                  avif={menuAvif}
                  webp={menuWebp}
                  width={520}
                  height={1126}
                  alt={r.menu.alt}
                  sizes="220px"
                />
              </div>
              <figcaption>{r.menu.caption}</figcaption>
            </figure>
            <dl className="product__facts product__facts--media">
              {r.facts.map((fact) => (
                <div key={fact.title}>
                  <dt>{fact.title}</dt>
                  <dd>{fact.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </article>
      </div>
    </section>
  );
}
