import { LOCALES, PATHS, useLocale, useRouteInfo, useT } from '@/i18n';

/**
 * Selector de idioma de la barra superior: un link a la misma vista en el otro idioma (`/` ↔
 * `/es/`, `/signup` ↔ `/registro`). Navegación normal, sin guardar nada: el idioma lo decide la
 * ruta. Visible «ES»/«EN»; el nombre accesible es el del idioma («Español», «English»), en ese
 * idioma. `search` conserva la query (el plan elegido en el registro). Sin equivalente, nada.
 */
export function LanguageSwitch({
  search = '',
  full = false,
  className = '',
}: {
  search?: string;
  /** Muestra el nombre completo («Español») en vez del código. */
  full?: boolean;
  className?: string;
}) {
  const t = useT();
  const { alternate } = useRouteInfo();
  if (!alternate) return null;
  const target = t.common.switchTo;
  return (
    <a
      className={`lang-switch ${className}`.trim()}
      href={`${alternate}${search}`}
      hrefLang={target.lang}
      lang={target.lang}
      title={target.title}
    >
      {full ? (
        target.label
      ) : (
        <>
          <span aria-hidden="true">{target.short}</span>
          <span className="sr-only">{target.label}</span>
        </>
      )}
    </a>
  );
}

/**
 * Idiomas en el pie: los dos, el actual marcado. Desde una página que solo existe en español
 * (las legales), el inglés lleva al inicio en inglés.
 */
export function FooterLanguages() {
  const t = useT();
  const locale = useLocale();
  const { path, alternate } = useRouteInfo();
  return (
    <nav aria-label={t.common.languageNav}>
      <h2 className="footer__title">{t.common.languageNav}</h2>
      <ul className="footer__links">
        {LOCALES.map((l) => {
          const current = l === locale;
          const name = l === 'en' ? 'English' : 'Español';
          return (
            <li key={l}>
              <a
                href={current ? path : (alternate ?? PATHS[l].home)}
                hrefLang={l}
                lang={l}
                aria-current={current ? 'page' : undefined}
              >
                {name}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
