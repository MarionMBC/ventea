import { APP_STATUS, type AppStatus } from '@ventea/shared';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAppQueue } from './hooks';
import { APP_STATUS_LABEL, formatDateTime, formatDay, PLAN_LABEL, PUBLISHER_LABEL } from './labels';

type Filter = AppStatus | 'pending';

function readFilter(value: string | null): Filter {
  return APP_STATUS.includes(value as AppStatus) ? (value as AppStatus) : 'pending';
}

/** Cola de apps propias pedidas por las marcas (`/plataforma/apps`). */
export function AppRequests() {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params.get('estado'));
  const queue = useAppQueue(filter);

  useEffect(() => {
    document.title = 'Apps · Plataforma · Ventea';
  }, []);

  return (
    <section className="pf-page" aria-labelledby="pf-apps-title">
      <div className="pf-page__head">
        <h1 id="pf-apps-title">Apps de las marcas</h1>
        {queue.data && (
          <p className="pf-muted" aria-live="polite">
            {queue.data.length} {queue.data.length === 1 ? 'app' : 'apps'}
          </p>
        )}
      </div>

      <div className="pf-filters pf-filters--single">
        <label className="field">
          <span className="field__label">Estado</span>
          <select
            className="field__input"
            value={filter}
            onChange={(event) =>
              setParams(event.target.value === 'pending' ? {} : { estado: event.target.value }, {
                replace: true,
              })
            }
          >
            <option value="pending">Pendientes (solicitadas, en construcción o en revisión)</option>
            {APP_STATUS.map((status) => (
              <option key={status} value={status}>
                {APP_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {queue.error && (
        <div className="state state--error" role="alert">
          <h2>No se pudo cargar la cola</h2>
          <p>{queue.error.message}</p>
          <button type="button" className="btn btn--ghost" onClick={() => void queue.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {queue.isPending && <p className="pf-muted">Cargando apps…</p>}

      {queue.data && queue.data.length === 0 && (
        <div className="state state--empty">
          <h2>Nada en la cola</h2>
          <p>
            {filter === 'pending'
              ? 'Ninguna marca tiene una app pendiente.'
              : 'No hay apps con ese estado.'}
          </p>
        </div>
      )}

      {queue.data && queue.data.length > 0 && (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <caption className="sr-only">Apps, la más antigua primero</caption>
            <thead>
              <tr>
                <th scope="col">Marca</th>
                <th scope="col">Plan</th>
                <th scope="col">Estado</th>
                <th scope="col">Publica</th>
                <th scope="col">bundleId</th>
                <th scope="col">Solicitada</th>
                <th scope="col">Actualizada</th>
              </tr>
            </thead>
            <tbody>
              {queue.data.map((app) => (
                <tr key={app.slug}>
                  <th scope="row">
                    <Link className="pf-link" to={`/plataforma/marcas/${app.slug}/app`}>
                      {app.name}
                    </Link>
                    <span className="pf-slug">{app.slug}</span>
                  </th>
                  <td>{app.planCode ? PLAN_LABEL[app.planCode] : '—'}</td>
                  <td>
                    <span className={`pf-badge pf-app pf-app--${app.status}`}>
                      {APP_STATUS_LABEL[app.status]}
                    </span>
                  </td>
                  <td>{PUBLISHER_LABEL[app.publisher]}</td>
                  <td>
                    <code>{app.bundleId}</code>
                  </td>
                  <td>{app.requestedAt ? formatDay(app.requestedAt) : '—'}</td>
                  <td>{formatDateTime(app.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
