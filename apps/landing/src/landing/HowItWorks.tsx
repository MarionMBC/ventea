import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { TRIAL_DAYS } from '@/config';
import { signupHref, useLocale, useT } from '@/i18n';

/**
 * Sección F — los pasos reales del alta. Los tres primeros son el registro («Elige tu plan»,
 * «Tu restaurante», «Tu cuenta»); el alta crea la marca, la sucursal principal, el programa de
 * puntos y la prueba (docs/api.md). El menú hoy lo carga el equipo de Ventea (script
 * import-menu), y así se dice. La línea avanza con el paso que está a la vista.
 */
export function HowItWorks() {
  const h = useT().how;
  const locale = useLocale();
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const steps = h.steps;

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = items.current.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) setActive((current) => Math.max(current, index));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const node of items.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="section how" id="como-funciona" aria-labelledby="how-title">
      <div className="container how__inner">
        <header className="how__head" data-reveal>
          <p className="eyebrow">{h.eyebrow}</p>
          <h2 className="display section__title" id="how-title">
            {h.title}
          </h2>
          <p className="section__lead">{h.lead}</p>
          <a className="btn btn--primary btn--lg how__cta" href={signupHref(locale)}>
            {h.cta}
          </a>
        </header>

        <ol
          className="timeline"
          style={{ '--progress': active / (steps.length - 1) } as CSSProperties}
        >
          {steps.map((step, index) => (
            <li
              key={step.title}
              ref={(node) => {
                items.current[index] = node;
              }}
              className={`timeline__step${index <= active ? ' is-reached' : ''}`}
            >
              <span className="timeline__dot" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text(TRIAL_DAYS)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
