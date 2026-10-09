import { useRef, useState, type KeyboardEvent } from 'react';

import { DEMO_EARNED, REWARDS } from './food';
import { useInView, useReducedMotion, useSequence } from './motion';
import { Phone, type PhoneScreen } from './Phone';

/**
 * Sección B — el recorrido del cliente en tres etapas, como pestañas (WAI-ARIA tabs: flechas,
 * Inicio y Fin). Avanza sola solo cuando está en pantalla, se pausa, y deja de avanzar en cuanto
 * la persona elige una etapa. Es una demostración: no hace pedidos ni toca datos reales.
 */
const STAGES: { id: string; screen: PhoneScreen; tab: string; title: string; text: string }[] = [
  {
    id: 'explorar',
    screen: 'menu',
    tab: 'Explorar el menú',
    title: 'Un menú con su marca, desde el teléfono',
    text: 'Su cliente abre la app de su restaurante y recorre el menú con fotos, precios y combos. Su marca es lo primero que ve.',
  },
  {
    id: 'pedir',
    screen: 'cart',
    tab: 'Realizar un pedido',
    title: 'Pide para llevar o para comer en el local',
    text: 'Elige sus platos, confirma con su cuenta y sigue el estado del pedido: Nuevo, En cocina, Listo. Paga al retirar, directo en su restaurante.',
  },
  {
    id: 'volver',
    screen: 'points',
    tab: 'Acumular recompensas',
    title: 'Cada pedido suma puntos para el siguiente',
    text: `Con la configuración inicial gana 1 punto por cada lempira y ${REWARDS.welcomeBonus} de bienvenida al crear su cuenta. Este pedido le dio ${DEMO_EARNED}.`,
  },
];

export function Journey() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useSequence(STAGES.length, 4200, seen && !reduced && !paused);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number, focus = false) => {
    setStep(index);
    setPaused(true);
    if (focus) tabs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const last = STAGES.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? step === last
          ? 0
          : step + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? step === 0
            ? last
            : step - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  };

  const stage = STAGES[step]!;

  return (
    <section
      className="section section--tint journey"
      id="experiencia"
      aria-labelledby="journey-title"
    >
      <div className="container">
        <header className="section__head" data-reveal>
          <p className="eyebrow">Experiencia del cliente</p>
          <h2 className="display section__title" id="journey-title">
            Una experiencia que invita a volver.
          </h2>
        </header>

        <div className="journey__layout" ref={ref}>
          <div className="journey__copy">
            <div className="journey__tabs" role="tablist" aria-label="Etapas del recorrido">
              {STAGES.map((s, index) => (
                <button
                  key={s.id}
                  ref={(node) => {
                    tabs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${s.id}`}
                  aria-selected={index === step}
                  aria-controls={`panel-${s.id}`}
                  tabIndex={index === step ? 0 : -1}
                  className="journey__tab"
                  onClick={() => select(index)}
                  onKeyDown={onKeyDown}
                >
                  <span className="journey__num">0{index + 1}</span>
                  {s.tab}
                  <span
                    className={`journey__progress${index === step && seen && !reduced && !paused ? ' is-running' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>

            {/* Los tres paneles comparten celda: el alto es el del más largo y rotar no mueve
                nada debajo. El inactivo queda con visibility: hidden (fuera del árbol accesible). */}
            <div className="journey__panels">
              {STAGES.map((s, index) => (
                <div
                  key={s.id}
                  role="tabpanel"
                  id={`panel-${s.id}`}
                  aria-labelledby={`tab-${s.id}`}
                  className={`journey__panel${index === step ? ' is-active' : ''}`}
                >
                  <h3 className="journey__title">{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>

            {!reduced && (
              <button
                type="button"
                className="link-btn"
                aria-pressed={paused}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? 'Reproducir recorrido' : 'Pausar recorrido'}
              </button>
            )}
          </div>

          <div className="journey__device">
            <div className="journey__halo" aria-hidden="true" />
            <Phone screen={stage.screen} />
          </div>
        </div>
      </div>
    </section>
  );
}
