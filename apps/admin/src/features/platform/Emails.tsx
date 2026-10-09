import { EMAIL_STATUS, type EmailStatus } from '@ventea/shared';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { usePlatformEmails, useResendEmail } from './email-hooks';
import { formatDateTime } from './labels';

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  pending: 'En cola',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Falló',
  skipped: 'Sin enviar (sin SMTP)',
};

/** Reusa los colores de las insignias de suscripción. */
const STATUS_TONE: Record<EmailStatus, string> = {
  pending: 'trialing',
  sending: 'trialing',
  sent: 'active',
  failed: 'suspended',
  skipped: 'none',
};

const KIND_LABEL: Record<string, string> = {
  app_request: 'Solicitud de app',
  welcome: 'Bienvenida',
  trial_ending: 'Prueba por vencer',
  past_due: 'Pago pendiente',
  past_due_reminder: 'Recordatorio de pago',
  staff_invite: 'Invitación al equipo',
  staff_password_reset: 'Contraseña nueva (equipo)',
};

/** Un tipo que este panel no conoce (API más nueva) se muestra tal cual. */
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

type Filter = EmailStatus | 'all';

function readFilter(value: string | null): Filter {
  return EMAIL_STATUS.includes(value as EmailStatus) ? (value as EmailStatus) : 'all';
}

/** «Correos» (`/plataforma/correos`): últimos correos transaccionales y reenvío de fallidos. */
export function Emails() {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params.get('estado'));
  const emails = usePlatformEmails(filter);
  const resend = useResendEmail();

  useEffect(() => {
    document.title = 'Correos · Plataforma · Ventea';
  }, []);

  return (
    <section className="pf-page" aria-labelledby="pf-emails-title">
      <div className="pf-page__head">
        <h1 id="pf-emails-title">Correos</h1>
        {emails.data && (
          <p className="pf-muted" aria-live="polite">
            Últimos {emails.data.items.length}
          </p>
        )}
      </div>

      {emails.data?.transport === 'none' && (
        <div className="state" role="status">
          <p>
            No hay SMTP configurado (<code>SMTP_URL</code>): los correos quedan registrados como
            «Sin enviar» y no salen.
          </p>
        </div>
      )}

      <div className="pf-filters pf-filters--single">
        <label className="field">
          <span className="field__label">Estado</span>
          <select
            className="field__input"
            value={filter}
            onChange={(event) =>
              setParams(event.target.value === 'all' ? {} : { estado: event.target.value }, {
                replace: true,
              })
            }
          >
            <option value="all">Todos</option>
            {EMAIL_STATUS.map((status) => (
              <option key={status} value={status}>
                {EMAIL_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {resend.error && (
        <p className="state state--error" role="alert">
          No se pudo reenviar: {resend.error.message}
        </p>
      )}

      {emails.error && (
        <div className="state state--error" role="alert">
          <h2>No se pudieron cargar los correos</h2>
          <p>{emails.error.message}</p>
          <button type="button" className="btn btn--ghost" onClick={() => void emails.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {emails.isPending && <p className="pf-muted">Cargando correos…</p>}

      {emails.data && emails.data.items.length === 0 && (
        <div className="state state--empty">
          <h2>Sin correos</h2>
          <p>
            {filter === 'all'
              ? 'Todavía no se envió ningún correo.'
              : 'No hay correos en ese estado.'}
          </p>
        </div>
      )}

      {emails.data && emails.data.items.length > 0 && (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <caption className="sr-only">Correos, el más nuevo primero</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">Marca</th>
                <th scope="col">Para</th>
                <th scope="col">Asunto</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {emails.data.items.map((email) => (
                <tr key={email.id}>
                  <td>{formatDateTime(email.createdAt)}</td>
                  <td>{kindLabel(email.kind)}</td>
                  <td>
                    {email.tenant ? (
                      <Link className="pf-link" to={`/plataforma/marcas/${email.tenant.slug}`}>
                        {email.tenant.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{email.to}</td>
                  <td>{email.subject}</td>
                  <td>
                    <span className={`pf-badge pf-badge--${STATUS_TONE[email.status]}`}>
                      {EMAIL_STATUS_LABEL[email.status]}
                    </span>
                    {email.error && (
                      <span className="pf-muted pf-email-error">
                        {email.attempts} {email.attempts === 1 ? 'intento' : 'intentos'} ·{' '}
                        {email.error}
                      </span>
                    )}
                  </td>
                  <td>
                    {email.status === 'failed' && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(email.id)}
                      >
                        Reenviar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
