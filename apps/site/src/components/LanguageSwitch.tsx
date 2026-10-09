import type { MouseEvent } from 'react';

import { dict } from '@/i18n';
import { translateAnchor } from '@/links';
import { alternatePath, otherLocale, type Route } from '@/routes';

/**
 * Link al mismo contenido en el otro idioma. Sin JS lleva a la página equivalente; con JS además
 * conserva la sección (`/#services` → `/es/#servicios`).
 */
export function LanguageSwitch({ route, className }: { route: Route; className?: string }) {
  const t = dict(route.locale);
  const other = otherLocale(route.locale);
  const href = alternatePath(route, other);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    const anchor = window.location.hash.slice(1);
    const mapped = anchor ? translateAnchor(decodeURIComponent(anchor), route.locale, other) : null;
    if (!mapped) return;
    event.preventDefault();
    window.location.assign(`${href}#${mapped}`);
  };

  return (
    <a
      className={['lang-switch', className].filter(Boolean).join(' ')}
      href={href}
      hrefLang={other}
      lang={other}
      onClick={onClick}
    >
      <span aria-hidden="true">{t.lang.otherShort}</span>
      <span className="sr-only">{t.lang.otherLabel}</span>
    </a>
  );
}
