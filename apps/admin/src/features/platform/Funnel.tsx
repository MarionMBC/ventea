import { FUNNEL_EVENT, type FunnelEvent } from '@ventea/shared';
import { useEffect } from 'react';

import { useFunnel } from './hooks';

export const FUNNEL_LABEL: Record<FunnelEvent, string> = {
  visit: 'Visitas',
  cta_click: 'Clic en «Probar»',
  signup_start: 'Abre el registro',
  signup_step_2: 'Paso 2',
  signup_step_3: 'Paso 3',
  signup_complete: 'Registros',
};

/** Porcentaje entero de `part` sobre `total`, o «—» sin base. */
export function conversion(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((part / total) * 1000) / 10}%`;
}

const dayFormat = new Intl.DateTimeFormat('es-HN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * «Embudo de registro» (TASK-007): contadores diarios de la landing, sin cookies ni datos
 * personales. Una fila por día (el más nuevo arriba) y los totales del período.
 */
export function Funnel() {
  const { data, error, isPending, refetch } = useFunnel(30);

  useEffect(() => {
    document.title = 'Embudo de registro · Plataforma · Ventea';
  }, []);

  return (
    <section className="pf-page" aria-labelledby="pf-funnel-title">
      <div className="pf-page__head">
        <h1 id="pf-funnel-title">Embudo de registro</h1>
        {data && <p className="pf-muted">Últimos 30 días · día en {data.timezone}</p>}
      </div>

      {error && (
        <div className="state state--error" role="alert">
          <h2>No se pudo cargar el embudo</h2>
          <p>{error.message}</p>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {isPending && !error && <p className="pf-muted">Cargando embudo…</p>}

      {data && (
        <>
          <dl className="pf-summary" aria-label="Totales de 30 días">
            <div>
              <dt>Visitas</dt>
              <dd>{data.totals.visit}</dd>
            </div>
            <div>
              <dt>Registros</dt>
              <dd>{data.totals.signup_complete}</dd>
            </div>
            <div>
              <dt>Conversión visita → registro</dt>
              <dd>{conversion(data.totals.signup_complete, data.totals.visit)}</dd>
            </div>
            <div>
              <dt>Abren el registro → completan</dt>
              <dd>{conversion(data.totals.signup_complete, data.totals.signup_start)}</dd>
            </div>
          </dl>

          <div className="pf-table-wrap">
            <table className="pf-table">
              <caption className="sr-only">
                Eventos del embudo por día, el más nuevo primero
              </caption>
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  {FUNNEL_EVENT.map((event) => (
                    <th key={event} scope="col" className="pf-num">
                      {FUNNEL_LABEL[event]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.days.map(({ day, counts }) => (
                  <tr key={day}>
                    <th scope="row">
                      <time dateTime={day}>{dayFormat.format(new Date(`${day}T00:00:00Z`))}</time>
                    </th>
                    {FUNNEL_EVENT.map((event) => (
                      <td key={event} className="pf-num">
                        {counts[event]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  {FUNNEL_EVENT.map((event) => (
                    <td key={event} className="pf-num">
                      {data.totals[event]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="pf-muted">
            Contadores propios de la landing: sin cookies, sin IP ni datos personales. «Visitas» y
            los pasos cuentan una vez por pestaña; «Registros» los cuenta la API al crear cada
            marca.
          </p>
        </>
      )}
    </section>
  );
}
