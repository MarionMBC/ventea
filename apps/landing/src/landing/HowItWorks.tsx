import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { TRIAL_DAYS } from '@/config';

/**
 * Sección F — los pasos reales del alta. Los tres primeros son el registro de /registro («Elige
 * tu plan», «Tu restaurante», «Tu cuenta»); el alta crea la marca, la sucursal principal, el
 * programa de puntos y la prueba (docs/api.md). El menú hoy lo carga el equipo de Ventea
 * (script import-menu), y así se dice. La línea avanza con el paso que está a la vista.
 */
const STEPS = [
  {
    title: 'Elija su plan',
    text: `Empiece con ${TRIAL_DAYS} días de prueba gratis, sin tarjeta. Puede cambiar de plan después.`,
  },
  {
    title: 'Registre su restaurante',
    text: 'El nombre de su negocio y su dirección propia: su-restaurante.ventea.tech.',
  },
  {
    title: 'Cree su cuenta',
    text: 'Su panel queda listo con su sucursal principal y su programa de puntos. La dirección se activa en uno o dos minutos.',
  },
  {
    title: 'Cargamos su menú con usted',
    text: 'Nos comparte su carta (platos, precios, fotos y extras) y la dejamos lista en su cuenta.',
  },
  {
    title: 'Reciba pedidos y premie a sus clientes',
    text: 'Sus clientes piden con su cuenta, los pedidos llegan a su tablero y cada compra entregada les suma puntos.',
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

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
          <p className="eyebrow">Cómo funciona</p>
          <h2 className="display section__title" id="how-title">
            Digitalizar su restaurante puede ser más sencillo.
          </h2>
          <p className="section__lead">
            El registro toma unos minutos y no pide tarjeta. Lo demás lo hacemos con usted.
          </p>
          <a className="btn btn--primary btn--lg how__cta" href="/registro">
            Registrar mi restaurante
          </a>
        </header>

        <ol
          className="timeline"
          style={{ '--progress': active / (STEPS.length - 1) } as CSSProperties}
        >
          {STEPS.map((step, index) => (
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
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
