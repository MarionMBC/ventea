import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { Dict, ServiceId } from '@/i18n';
import { sectionHref } from '@/links';

import { selectProjectType } from './projectTypeEvent';

/** En pantallas anchas siempre hay un panel abierto (maestro-detalle); en angostas es acordeón. */
const WIDE_QUERY = '(min-width: 900px)';

function isWide(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(WIDE_QUERY).matches);
}

/** Mini diagrama de cada servicio: trazos simples que se dibujan al abrir el panel. */
function ServiceGlyph({ id }: { id: ServiceId }) {
  const shapes: Record<ServiceId, ReactNode> = {
    software: (
      <>
        <rect x="56" y="30" width="128" height="26" rx="2" />
        <rect x="56" y="66" width="128" height="26" rx="2" />
        <rect x="56" y="102" width="128" height="26" rx="2" className="accent" />
        <path d="M30 43h16M30 79h16M30 115h16M194 115h16" />
      </>
    ),
    apps: (
      <>
        <rect x="28" y="26" width="130" height="96" rx="3" />
        <path d="M28 42h130M40 34h4M50 34h4" />
        <rect x="170" y="40" width="44" height="88" rx="6" className="accent" />
        <path d="M184 116h16M44 60h60M44 74h86M44 88h48" />
      </>
    ),
    ai: (
      <>
        <circle cx="46" cy="50" r="10" />
        <circle cx="46" cy="110" r="10" />
        <circle cx="110" cy="80" r="14" className="accent" />
        <path d="M56 54l40 20M56 106l40-20M124 80h38" />
        <rect x="162" y="62" width="52" height="36" rx="3" />
        <path d="M176 80l7 7 13-14" />
      </>
    ),
    architecture: (
      <>
        <rect x="88" y="22" width="64" height="26" rx="2" className="accent" />
        <path d="M120 48v18M52 66h136M52 66v18M120 66v18M188 66v18" />
        <rect x="26" y="84" width="52" height="24" rx="2" />
        <rect x="94" y="84" width="52" height="24" rx="2" />
        <rect x="162" y="84" width="52" height="24" rx="2" />
        <path d="M52 108v20h136v-20" strokeDasharray="4 4" />
      </>
    ),
    saas: (
      <>
        <rect x="84" y="56" width="72" height="48" rx="3" className="accent" />
        <rect x="24" y="22" width="44" height="30" rx="2" />
        <rect x="172" y="22" width="44" height="30" rx="2" />
        <rect x="98" y="122" width="44" height="26" rx="2" />
        <path d="M68 37h16v19M172 37h-16v19M120 104v18" />
      </>
    ),
  };
  return (
    <svg className="svc-glyph" viewBox="0 0 240 160" aria-hidden="true" focusable="false">
      {shapes[id]}
    </svg>
  );
}

/**
 * Servicios 01-05 (brief §7): maestro-detalle en escritorio y acordeón en móvil, con el MISMO
 * marcado (patrón acordeón de la APG: encabezado con botón `aria-expanded` + región). El CSS de
 * grilla acomoda los botones a la izquierda y el panel abierto a la derecha. Teclado: Enter y
 * Espacio abren; flechas, Inicio y Fin mueven el foco entre servicios.
 */
export function Services({ t }: { t: Dict }) {
  const [open, setOpen] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const items = t.services.items;

  // Si se pasa a ancho con todo cerrado (acordeón), el maestro-detalle muestra el primero.
  useEffect(() => {
    const query = window.matchMedia?.(WIDE_QUERY);
    if (!query) return;
    const onChange = () => {
      if (query.matches) setOpen((value) => (value < 0 ? 0 : value));
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const toggle = (index: number) => {
    setOpen((value) => (value === index && !isWide() ? -1 : index));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const target =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  };

  return (
    <section className="section services" id={t.anchors.services} aria-labelledby="services-title">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="eyebrow">
            <span className="eyebrow__num">02</span>
            {t.services.eyebrow}
          </p>
          <h2 id="services-title" className="section-title">
            {t.services.title}
          </h2>
          <p className="section-lead">{t.services.lead}</p>
        </header>
        <div className="svc" data-reveal>
          {items.map((service, index) => {
            const expanded = open === index;
            const num = String(index + 1).padStart(2, '0');
            return (
              <div key={service.id} className="svc__item" data-open={expanded ? '' : undefined}>
                <h3 className="svc__head">
                  <button
                    ref={(element) => {
                      buttons.current[index] = element;
                    }}
                    type="button"
                    id={`svc-btn-${service.id}`}
                    className="svc__button"
                    aria-expanded={expanded}
                    aria-controls={`svc-panel-${service.id}`}
                    onClick={() => toggle(index)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    <span className="svc__num" aria-hidden="true">
                      {num}
                    </span>
                    <span className="svc__title">{service.title}</span>
                    <span className="svc__icon" aria-hidden="true" />
                  </button>
                </h3>
                <div
                  id={`svc-panel-${service.id}`}
                  className="svc__panel"
                  role="region"
                  aria-labelledby={`svc-btn-${service.id}`}
                  hidden={!expanded}
                >
                  <div className="svc__panel-top">
                    <p className="svc__index" aria-hidden="true">
                      {num} / {String(items.length).padStart(2, '0')}
                    </p>
                    <ServiceGlyph id={service.id} />
                  </div>
                  <p className="svc__summary">{service.summary}</p>
                  <p className="svc__body">{service.body}</p>
                  <div className="svc__cols">
                    <div>
                      <p className="svc__label">{t.services.includesLabel}</p>
                      <ul className="svc__list">
                        {service.includes.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="svc__label">{t.services.fitLabel}</p>
                      <p className="svc__fit">{service.fit}</p>
                    </div>
                  </div>
                  <a
                    className="link-arrow"
                    href={sectionHref(t.locale, 'contact')}
                    onClick={() => selectProjectType(service.id)}
                  >
                    {service.cta}
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
