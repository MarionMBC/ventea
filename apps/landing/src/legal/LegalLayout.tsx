import type { ReactNode } from 'react';

import { LEGAL_UPDATED_LABEL } from '@/config';
import { PlainHeader } from '@/site/PlainHeader';
import { SiteFooter } from '@/site/SiteFooter';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Marco de las páginas legales: índice con anclas y secciones numeradas. */
export function LegalLayout({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  /** Link a la otra página legal. */
  other: { href: string; label: string };
}) {
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <PlainHeader />
      <main className="legal" id="contenido">
        <div className="container container--narrow">
          <header className="legal__head">
            {/* Las legales existen solo en español (TASK-012): aviso para quien llega del sitio en
                inglés. No es parte del texto legal. */}
            <p className="legal__lang-note" lang="en">
              This document is available in Spanish only.{' '}
              <a href="/" hrefLang="en">
                Back to the English site
              </a>
            </p>
            <p className="eyebrow">Legal</p>
            <h1 className="legal__title">{title}</h1>
            <p className="legal__updated">Última actualización: {LEGAL_UPDATED_LABEL}</p>
            <div className="legal__intro">{intro}</div>
          </header>

          <nav className="legal__toc" aria-labelledby="legal-toc-title">
            <h2 className="legal__toc-title" id="legal-toc-title">
              Contenido
            </h2>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className="legal__section"
              aria-labelledby={`${section.id}-title`}
            >
              <h2 id={`${section.id}-title`}>
                {index + 1}. {section.title}
              </h2>
              {section.body}
            </section>
          ))}

          <p className="legal__other">
            Lee también nuestra <a href={other.href}>{other.label}</a>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
