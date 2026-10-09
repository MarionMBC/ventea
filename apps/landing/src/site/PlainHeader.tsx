import { homeHref, useLocale, useT } from '@/i18n';
import { Brand } from '@/landing/Brand';

import { LanguageSwitch } from './LanguageSwitch';

/**
 * Barra simple (registro y páginas legales): marca, volver al inicio y, si la vista existe en el
 * otro idioma, el cambio de idioma (`search` conserva la query del registro).
 */
export function PlainHeader({ search }: { search?: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <header className="topbar topbar--plain">
      <div className="container topbar__inner">
        <Brand />
        <div className="topbar__plain-end">
          <a className="topbar__back" href={homeHref(locale)}>
            {t.common.backHome}
          </a>
          <LanguageSwitch search={search} />
        </div>
      </div>
    </header>
  );
}
