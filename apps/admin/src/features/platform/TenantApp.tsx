import {
  APP_PUBLISHER,
  APP_STATUS,
  pushCredentialsInputSchema,
  type AppPublisher,
  type AppStatus,
  type PlatformApp,
  type PushCredentialsInput,
  type UpdatePlatformAppInput,
} from '@ventea/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ConfirmDialog } from './ConfirmDialog';
import { usePushCredentials, useTenantApp, useUpdateTenantApp } from './hooks';
import {
  APP_STATUS_LABEL,
  appEventLabel,
  formatDateTime,
  PLAN_LABEL,
  PUBLISHER_LABEL,
} from './labels';

interface Draft {
  bundleId: string;
  publisher: AppPublisher;
  status: AppStatus;
  version: string;
  buildNumber: string;
  android: string;
  ios: string;
}

function draftOf(app: PlatformApp): Draft {
  return {
    bundleId: app.bundleId,
    publisher: app.publisher,
    status: app.status,
    version: app.version ?? '',
    buildNumber: app.buildNumber === null ? '' : String(app.buildNumber),
    android: app.storeUrls.android ?? '',
    ios: app.storeUrls.ios ?? '',
  };
}

/** Diferencia con lo guardado; `null` y un mensaje si algo no es válido. */
export function appPatch(
  app: PlatformApp,
  draft: Draft,
): { patch: UpdatePlatformAppInput; error?: string } {
  const saved = draftOf(app);
  const patch: UpdatePlatformAppInput = {};
  const text = (value: string) => value.trim() || null;
  if (draft.bundleId.trim() !== saved.bundleId) patch.bundleId = draft.bundleId.trim();
  if (draft.publisher !== saved.publisher) patch.publisher = draft.publisher;
  if (draft.status !== saved.status) patch.status = draft.status;
  if (text(draft.version) !== text(saved.version)) {
    const version = text(draft.version);
    if (version && !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) {
      return { patch, error: 'La versión va como X.Y.Z (por ejemplo 1.2.0).' };
    }
    patch.version = version;
  }
  if (text(draft.buildNumber) !== text(saved.buildNumber)) {
    const raw = text(draft.buildNumber);
    const build = raw === null ? null : Number(raw);
    if (build !== null && (!Number.isInteger(build) || build < 1)) {
      return { patch, error: 'El número de build es un entero mayor que 0.' };
    }
    patch.buildNumber = build;
  }
  const storeUrls: NonNullable<UpdatePlatformAppInput['storeUrls']> = {};
  for (const store of ['android', 'ios'] as const) {
    if (text(draft[store]) !== text(saved[store])) {
      const url = text(draft[store]);
      if (url && !url.startsWith('https://')) {
        return { patch, error: 'Los links de tienda empiezan con https://.' };
      }
      storeUrls[store] = url;
    }
  }
  if (Object.keys(storeUrls).length > 0) patch.storeUrls = storeUrls;
  return { patch };
}

/**
 * Lee el JSON de la service account de Firebase pegado en el textarea. Solo valida forma: la API
 * guarda `project_id`, `client_email` y `private_key` cifrados y nunca los devuelve.
 */
export function parseServiceAccount(
  text: string,
): { credentials: PushCredentialsInput } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: 'No es un JSON válido. Pega el archivo de la service account completo.' };
  }
  const parsed = pushCredentialsInputSchema.safeParse(json);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    return {
      error: `Faltan datos o no son válidos: ${fields.join(', ') || 'formato'}. Debe ser la service account de Firebase (type: service_account).`,
    };
  }
  // Solo lo que la API acepta: nada extra del archivo viaja.
  const { type, project_id, client_email, private_key } = parsed.data;
  return { credentials: { type, project_id, client_email, private_key } };
}

/** App propia de una marca (`/plataforma/marcas/:slug/app`): AppConfig, push y eventos. */
export function TenantApp() {
  const { slug = '' } = useParams();
  const app = useTenantApp(slug);
  const update = useUpdateTenantApp(slug);
  const push = usePushCredentials(slug);
  const formId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [secretError, setSecretError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    document.title = `App de ${slug} · Plataforma · Ventea`;
  }, [slug]);

  const back = (
    <Link className="pf-back" to="/plataforma/apps">
      ← Cola de apps
    </Link>
  );

  if (app.error) {
    return (
      <section className="pf-page">
        {back}
        <div className="state state--error" role="alert">
          <h1>No se pudo cargar la app</h1>
          <p>{app.error.message}</p>
        </div>
      </section>
    );
  }
  if (!app.data) {
    return (
      <section className="pf-page">
        {back}
        <p className="pf-muted">Cargando app…</p>
      </section>
    );
  }

  const data = app.data;
  const current = draft ?? draftOf(data);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft({ ...current, [key]: value });
    setFormError(null);
    setFlash(null);
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { patch, error } = appPatch(data, current);
    if (error) return setFormError(error);
    if (Object.keys(patch).length === 0) return setFormError('No hay cambios para guardar.');
    update.mutate(patch, {
      onSuccess: () => {
        setDraft(null);
        setFlash('App actualizada.');
      },
    });
  };

  const onSaveSecret = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = parseServiceAccount(secret);
    if ('error' in result) return setSecretError(result.error);
    setSecretError(null);
    push.mutate(
      { credentials: result.credentials },
      {
        onSuccess: () => {
          // La clave no queda en pantalla ni en el estado una vez guardada.
          setSecret('');
          setFlash('Credenciales push guardadas (cifradas).');
        },
      },
    );
  };

  const saveError = formError ?? update.error?.message;

  return (
    <section className="pf-page" aria-labelledby="pf-app-title">
      {back}
      <div className="pf-page__head">
        <h1 id="pf-app-title">App de {data.tenant.name}</h1>
        <span className={`pf-badge pf-app pf-app--${data.status}`}>
          {APP_STATUS_LABEL[data.status]}
        </span>
      </div>
      <p className="pf-muted">
        <Link className="pf-link" to={`/plataforma/marcas/${data.tenant.slug}`}>
          {data.tenant.slug}
        </Link>{' '}
        · plan {data.tenant.planCode ? PLAN_LABEL[data.tenant.planCode] : 'sin suscripción'}
        {!data.exists && ' · sin solicitud todavía (valores por defecto)'}
      </p>

      {flash && (
        <p className="pf-flash" role="status">
          {flash}
        </p>
      )}

      <div className="pf-grid">
        <article className="pf-card" aria-labelledby="pf-app-config">
          <h2 id="pf-app-config">Configuración</h2>
          <form id={formId} className="form-grid" onSubmit={onSave} noValidate>
            <label className="field">
              <span className="field__label">bundleId</span>
              <input
                className="field__input"
                value={current.bundleId}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => set('bundleId', event.target.value)}
              />
            </label>
            <div className="form-row">
              <label className="field">
                <span className="field__label">Estado</span>
                <select
                  className="field__input"
                  value={current.status}
                  onChange={(event) => set('status', event.target.value as AppStatus)}
                >
                  {APP_STATUS.map((status) => (
                    <option key={status} value={status}>
                      {APP_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Publica</span>
                <select
                  className="field__input"
                  value={current.publisher}
                  onChange={(event) => set('publisher', event.target.value as AppPublisher)}
                >
                  {APP_PUBLISHER.map((publisher) => (
                    <option key={publisher} value={publisher}>
                      {PUBLISHER_LABEL[publisher]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span className="field__label">Versión (X.Y.Z)</span>
                <input
                  className="field__input"
                  value={current.version}
                  placeholder="1.0.0"
                  onChange={(event) => set('version', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Build</span>
                <input
                  className="field__input"
                  inputMode="numeric"
                  value={current.buildNumber}
                  onChange={(event) => set('buildNumber', event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span className="field__label">Google Play</span>
              <input
                className="field__input"
                type="url"
                placeholder="https://play.google.com/store/apps/details?id=…"
                value={current.android}
                onChange={(event) => set('android', event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">App Store</span>
              <input
                className="field__input"
                type="url"
                placeholder="https://apps.apple.com/…"
                value={current.ios}
                onChange={(event) => set('ios', event.target.value)}
              />
            </label>
            {saveError && (
              <p className="form-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="pf-actions">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!draft || update.isPending}
                onClick={() => {
                  setDraft(null);
                  setFormError(null);
                  update.reset();
                }}
              >
                Descartar
              </button>
              <button type="submit" className="btn btn--primary" disabled={update.isPending}>
                {update.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </article>

        <article className="pf-card" aria-labelledby="pf-app-push">
          <h2 id="pf-app-push">Notificaciones push (Firebase)</h2>
          <dl className="pf-facts">
            <div>
              <dt>Estado</dt>
              <dd>
                {data.push.configured ? (
                  <span className="pf-badge pf-badge--active">Configurado</span>
                ) : (
                  <span className="pf-badge pf-badge--none">Sin configurar</span>
                )}
              </dd>
            </div>
            {data.push.projectId && (
              <div>
                <dt>Proyecto</dt>
                <dd>
                  <code>{data.push.projectId}</code>
                </dd>
              </div>
            )}
            {data.push.updatedAt && (
              <div>
                <dt>Actualizado</dt>
                <dd>{formatDateTime(data.push.updatedAt)}</dd>
              </div>
            )}
          </dl>
          <form className="form-grid" onSubmit={onSaveSecret} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="pf-push-json">
                {data.push.configured ? 'Reemplazar credenciales' : 'Cargar credenciales'}
              </label>
              <textarea
                id="pf-push-json"
                className="field__input field__input--area field__input--mono"
                rows={6}
                value={secret}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                placeholder='{"type": "service_account", "project_id": "…", …}'
                aria-describedby="pf-push-hint"
                onChange={(event) => {
                  setSecret(event.target.value);
                  setSecretError(null);
                }}
              />
              <span id="pf-push-hint" className="field__hint">
                Pega el JSON de la service account de Firebase. Se guarda cifrado y nunca se vuelve
                a mostrar: acá solo se ve si está configurado.
              </span>
            </div>
            {(secretError ?? push.error?.message) && (
              <p className="form-error" role="alert">
                {secretError ?? push.error?.message}
              </p>
            )}
            <div className="pf-actions">
              {data.push.configured && (
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={push.isPending}
                  onClick={() => {
                    push.reset();
                    setConfirmClear(true);
                  }}
                >
                  Borrar credenciales
                </button>
              )}
              <button
                type="submit"
                className="btn btn--primary"
                disabled={!secret.trim() || push.isPending}
              >
                {push.isPending ? 'Guardando…' : 'Guardar credenciales'}
              </button>
            </div>
          </form>
        </article>
      </div>

      <article className="pf-card" aria-labelledby="pf-app-events">
        <h2 id="pf-app-events">Eventos</h2>
        {data.events.length === 0 ? (
          <p className="pf-muted">Sin eventos.</p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <caption className="sr-only">
                Últimos eventos de la app, el más reciente primero
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Evento</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event, index) => (
                  <tr key={`${event.createdAt.toISOString()}-${index}`}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>{appEventLabel(event.type)}</td>
                    <td>{event.actor}</td>
                    <td className="pf-detail">{event.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {confirmClear && (
        <ConfirmDialog
          title="¿Borrar las credenciales push?"
          confirmLabel="Sí, borrar"
          danger
          pending={push.isPending}
          error={push.error?.message}
          onCancel={() => setConfirmClear(false)}
          onConfirm={() =>
            push.mutate(
              { clear: true },
              {
                onSuccess: () => {
                  setConfirmClear(false);
                  setFlash('Credenciales push borradas: la marca deja de enviar avisos.');
                },
              },
            )
          }
        >
          <p>
            La app de {data.tenant.name} deja de recibir avisos de sus pedidos hasta cargarlas de
            nuevo.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
