import { CONTACT_EMAIL, TRIAL_DAYS } from '@/config';
import { useT } from '@/i18n';

import { REWARDS } from './food';

/**
 * Preguntas frecuentes, con respuestas alineadas al producto y a los términos: sin delivery ni
 * pago en línea (hoy se paga al retirar), puntos con la configuración inicial real y el pago
 * del plan coordinado con el equipo. `<details>` nativo: teclado y lectores sin JS. Las
 * preguntas, por idioma, en `t.faq.questions`.
 */
export function Faq() {
  const f = useT().faq;
  const questions = f.questions({
    days: TRIAL_DAYS,
    bonus: REWARDS.welcomeBonus,
    minToRedeem: REWARDS.minToRedeem,
  });
  return (
    <section className="section faq-section" id="preguntas" aria-labelledby="preguntas-title">
      <div className="container faq-layout">
        <header className="faq-layout__head" data-reveal>
          <p className="eyebrow">{f.eyebrow}</p>
          <h2 className="display section__title" id="preguntas-title">
            {f.title}
          </h2>
          <p className="section__lead">
            {f.leadBefore}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </header>
        <div className="faq">
          {questions.map(({ q, a }) => (
            <details key={q} className="faq__item">
              <summary>
                {q}
                <span className="faq__icon" aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
