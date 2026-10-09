import { STACK } from '@/content';
import type { Dict } from '@/i18n';
import { cssVars } from '@/style';

/** Nosotros + diferenciación (sin promesas absolutas, certificaciones, equipo ni cifras). */
export function About({ t }: { t: Dict }) {
  return (
    <section className="section about" id={t.anchors.about} aria-labelledby="about-title">
      <div className="container about__grid">
        <div className="about__intro" data-reveal>
          <p className="eyebrow">
            <span className="eyebrow__num">05</span>
            {t.about.eyebrow}
          </p>
          <h2 id="about-title" className="section-title">
            {t.about.title}
          </h2>
          {t.about.paragraphs.map((paragraph) => (
            <p key={paragraph} className="about__text">
              {paragraph}
            </p>
          ))}
          <div className="stack">
            <h3 className="stack__title">{t.about.stackTitle}</h3>
            <ul className="stack__list">
              {STACK.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="stack__note">{t.about.stackNote}</p>
          </div>
        </div>
        <div className="about__principles">
          <h3 className="about__subtitle" data-reveal>
            {t.about.principlesTitle}
          </h3>
          <ul className="principles">
            {t.about.principles.map((principle, index) => (
              <li
                key={principle.title}
                className="principle"
                data-reveal
                style={cssVars({ '--i': index % 2 })}
              >
                <span className="principle__mark" aria-hidden="true" />
                <h4 className="principle__title">{principle.title}</h4>
                <p>{principle.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
