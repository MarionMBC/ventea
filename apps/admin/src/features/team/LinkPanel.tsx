import { teamLinkPath, type TeamLinkKind, type TeamMailStatus } from '@ventea/shared';
import { useId, useRef, useState } from 'react';

import { useI18n } from '@/i18n';
import { IconCheck } from '@/ui/icons';

/** Enlace completo que abre el panel en esta misma dirección (`/admin/join#token`). */
export function teamLink(
  kind: TeamLinkKind,
  token: string,
  origin = window.location.origin,
): string {
  return `${origin}${teamLinkPath(kind, token)}`;
}

/** Texto según el correo: solo se dice «enviamos» si de verdad salió a la cola con SMTP. */
function mailMessage(mail: TeamMailStatus | undefined) {
  switch (mail) {
    case 'queued':
      return 'team.linkMail.queued' as const;
    case 'trial':
      return 'team.linkMail.trial' as const;
    case 'daily_limit':
      return 'team.linkMail.daily_limit' as const;
    default:
      return 'team.linkMail.manual' as const;
  }
}

/**
 * Enlace de un solo uso recién creado (invitación o contraseña nueva) para copiar y compartir.
 * La API también lo manda por correo cuando puede (TASK-021: con SMTP, fuera de la prueba y bajo
 * el tope diario); si no, o si no llega, el dueño lo copia y lo comparte. Se muestra una sola vez.
 */
export function LinkPanel({
  kind,
  token,
  email,
  expiresAt,
  mail,
}: {
  kind: TeamLinkKind;
  token: string;
  email: string;
  expiresAt: Date;
  /** Qué pasó con el correo (API). Sin dato, o sin SMTP, no se promete correo. */
  mail?: TeamMailStatus;
}) {
  const { t, dateTime } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const link = teamLink(kind, token);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch {
      // Sin permiso de portapapeles (http, iframe): se deja el enlace seleccionado.
      input.current?.select();
      setStatus('failed');
    }
  };

  return (
    <div className="link-panel">
      <h3 className="link-panel__title">{t('team.linkTitle')}</h3>
      <p>
        {t(mailMessage(mail), { email })} {t('team.linkExpiry', { date: dateTime(expiresAt) })}
      </p>
      <label className="field__label" htmlFor={`${id}-link`}>
        {t('team.linkLabel')}
      </label>
      <div className="link-panel__row">
        <input
          ref={input}
          id={`${id}-link`}
          className="field__input field__input--mono"
          readOnly
          value={link}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className="btn btn--primary" onClick={() => void copy()}>
          {status === 'copied' && <IconCheck size={18} />}
          {status === 'copied' ? t('team.copied') : t('team.copy')}
        </button>
      </div>
      <p className="field__hint" role="status">
        {status === 'failed' ? t('team.copyFailed') : t('team.linkOnce')}
      </p>
    </div>
  );
}
