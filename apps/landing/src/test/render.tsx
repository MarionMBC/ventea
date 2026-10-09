import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import { I18nProvider } from '@/i18n';
import { routeMeta } from '@/seo/meta';

/**
 * `render` dentro del idioma de una ruta, como lo arma `App` (TASK-012). Sin proveedor los
 * componentes salen en inglés, el idioma principal.
 */
export function renderAt(path: string, ui: ReactElement): RenderResult {
  const route = routeMeta(path);
  return render(
    <I18nProvider locale={route.lang} path={route.path} alternate={route.alternate}>
      {ui}
    </I18nProvider>,
  );
}

/** Vista en español (la landing en `/es/`, salvo que se indique otra ruta). */
export function renderEs(ui: ReactElement, path = '/es/'): RenderResult {
  return renderAt(path, ui);
}

/** Vista en inglés (la landing en `/`, salvo que se indique otra ruta). */
export function renderEn(ui: ReactElement, path = '/'): RenderResult {
  return renderAt(path, ui);
}
