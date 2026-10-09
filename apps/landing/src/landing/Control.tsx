import { useT } from '@/i18n';

import { PanelShot } from './shots';

/**
 * Sección E — el panel del restaurante. Solo lo que el panel hace hoy (apps/admin): el tablero
 * de pedidos con su historial del día y la facturación del plan. La captura es del panel real
 * rediseñado (TASK-011), con pedidos de ejemplo, en el idioma de la página.
 */
const ICONS = [
  'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z',
  'M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0',
  'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  'M3 7h18v10H3zM3 11h18M7 15h3',
];

export function Control() {
  const c = useT().control;
  return (
    <section className="section section--tint control" id="panel" aria-labelledby="control-title">
      <div className="container">
        <header className="section__head" data-reveal>
          <p className="eyebrow">{c.eyebrow}</p>
          <h2 className="display section__title" id="control-title">
            {c.title}
          </h2>
          <p className="section__lead">{c.lead}</p>
        </header>

        <figure className="browser" data-reveal>
          <div className="browser__bar" aria-hidden="true">
            <span />
            <span />
            <span />
            <em>{c.url}</em>
          </div>
          <PanelShot view="history" />
          <figcaption>{c.caption}</figcaption>
        </figure>

        <ul className="control__features">
          {c.features.map((feature, index) => (
            <li key={feature.title} data-reveal>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={ICONS[index]} />
              </svg>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
