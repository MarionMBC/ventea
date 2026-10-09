import type { Dict } from '@/i18n';
import { cssVars } from '@/style';

/**
 * Cómo trabajamos: línea estructural (horizontal en escritorio, vertical en móvil) que se dibuja
 * al entrar en pantalla, con los entregables reales de cada fase. Sin JS o con reduced-motion se
 * ve completa desde el inicio.
 */
export function Process({ t }: { t: Dict }) {
  const phases = t.process.phases;
  return (
    <section
      className="section section--dark process"
      id={t.anchors.process}
      aria-labelledby="process-title"
    >
      <div className="container">
        <header className="section-head section-head--dark" data-reveal>
          <p className="eyebrow eyebrow--dark">
            <span className="eyebrow__num">03</span>
            {t.process.eyebrow}
          </p>
          <h2 id="process-title" className="section-title">
            {t.process.title}
          </h2>
          <p className="section-lead">{t.process.lead}</p>
        </header>
        <div className="process__track" data-reveal>
          <div className="process__line" aria-hidden="true" />
          <ol className="process__phases">
            {phases.map((phase, index) => (
              <li key={phase.title} className="phase" style={cssVars({ '--i': index })}>
                <span className="phase__node" aria-hidden="true" />
                <p className="phase__num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="phase__title">{phase.title}</h3>
                <p className="phase__text">{phase.text}</p>
                <p className="phase__label">{t.process.deliverablesLabel}</p>
                <ul className="phase__list">
                  {phase.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
