import { SUBSCRIPTION_STATUS } from '@ventea/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useTenantList, type StatusFilter } from './hooks';
import { formatDay, INTERVAL_LABEL, PLAN_LABEL, periodEndOf, STATUS_LABEL } from './labels';
import { StatusBadge } from './StatusBadge';

const SEARCH_DEBOUNCE_MS = 250;

function readStatus(value: string | null): StatusFilter {
  return SUBSCRIPTION_STATUS.includes(value as never) ? (value as StatusFilter) : 'all';
}

/** Marcas de la plataforma: tabla paginada con filtro por estado y búsqueda por slug. */
export function TenantList() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const status = readStatus(params.get('estado'));
  const search = params.get('q') ?? '';
  const [draft, setDraft] = useState(search);

  const { view, isPending, error, refetch } = useTenantList(page, status, search);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // La búsqueda va a la URL (compartible) con un pequeño debounce.
  useEffect(() => {
    if (draft === search) return;
    const timer = window.setTimeout(
      () => update({ q: draft.trim() || null, pagina: null }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [draft, search, update]);

  return (
    <section className="pf-page" aria-labelledby="pf-list-title">
      <div className="pf-page__head">
        <h1 id="pf-list-title">Marcas</h1>
        {view && (
          <p className="pf-muted" aria-live="polite">
            {view.total} {view.total === 1 ? 'marca' : 'marcas'}
          </p>
        )}
      </div>

      <div className="pf-filters" role="search">
        <label className="field pf-filters__search">
          <span className="field__label">Buscar por slug o nombre</span>
          <input
            className="field__input"
            type="search"
            value={draft}
            placeholder="pollos-juan"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Estado</span>
          <select
            className="field__input"
            value={status}
            onChange={(event) =>
              update({
                estado: event.target.value === 'all' ? null : event.target.value,
                pagina: null,
              })
            }
          >
            <option value="all">Todos</option>
            {SUBSCRIPTION_STATUS.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="state state--error" role="alert">
          <h2>No se pudieron cargar las marcas</h2>
          <p>{error.message}</p>
          <button type="button" className="btn btn--ghost" onClick={() => void refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {isPending && !view && !error && <p className="pf-muted">Cargando marcas…</p>}

      {view && view.items.length === 0 && (
        <div className="state state--empty">
          <h2>Sin resultados</h2>
          <p>No hay marcas con ese filtro.</p>
        </div>
      )}

      {view && view.items.length > 0 && (
        <>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <caption className="sr-only">Marcas registradas, la más nueva primero</caption>
              <thead>
                <tr>
                  <th scope="col">Marca</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Región</th>
                  <th scope="col">Alta</th>
                  <th scope="col" className="pf-num">
                    Pedidos 30 d
                  </th>
                  <th scope="col">Prueba / período</th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((tenant) => {
                  const end = periodEndOf(tenant);
                  const sub = tenant.subscription;
                  return (
                    <tr key={tenant.id}>
                      <th scope="row">
                        <Link to={`/plataforma/marcas/${tenant.slug}`} className="pf-link">
                          {tenant.name}
                        </Link>
                        <span className="pf-slug">{tenant.slug}</span>
                      </th>
                      <td>
                        {sub ? `${PLAN_LABEL[sub.planCode]} ${INTERVAL_LABEL[sub.interval]}` : '—'}
                      </td>
                      <td>
                        <StatusBadge status={sub?.status} />
                        {!tenant.isActive && <span className="pf-slug">desactivada</span>}
                      </td>
                      <td>{tenant.region}</td>
                      <td>{formatDay(tenant.createdAt)}</td>
                      <td className="pf-num">{tenant.ordersLast30Days}</td>
                      <td>
                        {end ? (
                          <>
                            {formatDay(end.date)}
                            <span className="pf-slug">{end.label}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="pf-pager" aria-label="Paginación">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={view.page <= 1}
              onClick={() => update({ pagina: view.page - 1 > 1 ? String(view.page - 1) : null })}
            >
              Anterior
            </button>
            <span aria-current="page">
              Página {view.page} de {view.pageCount}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={view.page >= view.pageCount}
              onClick={() => update({ pagina: String(view.page + 1) })}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
