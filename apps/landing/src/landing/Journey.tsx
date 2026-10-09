import { useRef, useState, type KeyboardEvent } from 'react';

import { useT } from '@/i18n';

import { useInView, useReducedMotion, useSequence } from './motion';
import { REWARDS } from './rewards';
import { SAMPLE_ORDER, ShotPhone, type AppShot } from './shots';

/**
 * Sección B — el recorrido del cliente en tres etapas, como pestañas (WAI-ARIA tabs: flechas,
 * Inicio y Fin). Avanza sola solo cuando está en pantalla, se pausa, y deja de avanzar en cuanto
 * la persona elige una etapa. Capturas reales de la app de Carolina (cuenta y pedido de ejemplo). Los
 * textos de cada etapa, por idioma, en `t.journey.stages`.
 */
const STAGES: { id: string; key: 'explore' | 'order' | 'return'; screen: AppShot }[] = [
  { id: 'explorar', key: 'explore', screen: 'menu' },
  { id: 'pedir', key: 'order', screen: 'tracking' },
  { id: 'volver', key: 'return', screen: 'profile' },
];

export function Journey() {
  const j = useT().journey;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useSequence(STAGES.length, 4200, seen && !reduced && !paused);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const copy = {
    explore: j.stages.explore,
    order: j.stages.order,
    return: {
      ...j.stages.return,
      text: j.stages.return.text(REWARDS.welcomeBonus, SAMPLE_ORDER.earnedPoints),
    },
  };

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
          <p className="eyebrow">{j.eyebrow}</p>
          <h2 className="display section__title" id="journey-title">
            {j.title}
          </h2>
        </header>

        <div className="journey__layout" ref={ref}>
          <div className="journey__copy">
            <div className="journey__tabs" role="tablist" aria-label={j.tablistLabel}>
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
                  {copy[s.key].tab}
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
                  <h3 className="journey__title">{copy[s.key].title}</h3>
                  <p>{copy[s.key].text}</p>
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
                {paused ? j.play : j.pause}
              </button>
            )}
          </div>

          <div className="journey__device">
            <div className="journey__halo" aria-hidden="true" />
            <ShotPhone screens={STAGES.map((s) => s.screen)} active={stage.screen} />
          </div>
        </div>
      </div>
    </section>
  );
}
