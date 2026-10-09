import { useMutation } from '@tanstack/react-query';
import {
  invitationPreviewSchema,
  passwordResetPreviewSchema,
  staffAuthResponseSchema,
  type InvitationPreview,
  type PasswordResetPreview,
  type StaffAuthResponse,
} from '@ventea/shared';
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useServices, useSession } from '@/app/services';
import { brandStyle, useTenant } from '@/app/tenant';
import { describeError, useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { BrandMark, brandName } from '@/ui/Brand';
import { IconAlert } from '@/ui/icons';
import { LangSwitch } from '@/ui/LangSwitch';

/** Token del fragmento (`/admin/join#<token>`): el fragmento no viaja al servidor ni en Referer. */
export function tokenFromHash(hash = window.location.hash): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, '')).trim();
  } catch {
    return '';
  }
}

/** Mismo marco que el login: marca a la izquierda (escritorio), formulario a la derecha. */
function AuthFrame({ children }: { children: ReactNode }) {
  const { data: tenant } = useTenant();
  const { t } = useI18n();
  const name = brandName(tenant);
  return (
    <main className="auth" style={brandStyle(tenant)}>
      <section className="auth__brand" aria-hidden="true">
        <div className="auth__brand-inner">
          <BrandMark tenant={tenant} size={56} />
          <p className="auth__brand-name">{name}</p>
          <p className="auth__tagline">{t('login.tagline')}</p>
        </div>
      </section>
      <section className="auth__panel">
        <div className="auth__top">
          <LangSwitch />
        </div>
        <div className="auth__form">
          <div className="auth__head">
            <span className="auth__mobile-mark">
              <BrandMark tenant={tenant} size={44} />
            </span>
            <p className="auth__eyebrow">{name}</p>
          </div>
          {children}
        </div>
        <p className="powered auth__powered">{t('app.poweredBy')}</p>
      </section>
    </main>
  );
}

function InvalidLink() {
  const { t } = useI18n();
  return (
    <div className="link-state" role="alert">
      <span className="state__icon">
        <IconAlert size={28} />
      </span>
      <h1 className="auth__title">{t('join.invalidTitle')}</h1>
      <p className="auth__hint">{t('join.invalidBody')}</p>
      <Link className="btn btn--primary btn--block" to="/login">
        {t('join.toLogin')}
      </Link>
    </div>
  );
}

/** Enlace roto o vencido (404) o mal formado (400): mismo aviso, sin decir cuál de todos. */
function isInvalidLink(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400) && !error.kind;
}

/** Contraseña + repetición, con validación propia antes de llamar a la API. */
function usePasswordFields() {
  const { t } = useI18n();
  const id = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const validate = () => {
    const found =
      password.length < 8 ? t('join.tooShort') : password !== confirm ? t('join.mismatch') : null;
    setError(found);
    return found === null;
  };
  const fields = (
    <>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-password`}>
          {t('join.password')}
        </label>
        <input
          id={`${id}-password`}
          className="field__input"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          aria-describedby={`${id}-hint`}
          aria-invalid={!!error}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
        <p id={`${id}-hint`} className="field__hint">
          {t('join.passwordHint')}
        </p>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-confirm`}>
          {t('join.confirm')}
        </label>
        <input
          id={`${id}-confirm`}
          className="field__input"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setConfirm(event.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={`${id}-error`} className="field__error">
            {error}
          </p>
        )}
      </div>
    </>
  );
  return { password, validate, fields };
}

/**
 * Lo común a los dos enlaces: leer el token del fragmento, consultarlo (`lookup`) y, si sirve,
 * mostrar el formulario. Con una sesión abierta en este navegador, se pide cerrarla primero.
 */
function useLinkPreview<T>(path: string, parse: (data: unknown) => T) {
  const { client } = useServices();
  const [token] = useState(() => tokenFromHash());
  // Leído el token, sale de la barra de direcciones y del historial (un solo uso, pero igual).
  useEffect(() => {
    if (!window.location.hash) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }, []);
  const lookup = useMutation({
    mutationFn: () =>
      client.request<T>(path, {
        method: 'POST',
        body: { token },
        auth: false,
        schema: { parse },
      }),
  });
  const { mutate } = lookup;
  useEffect(() => {
    if (token) mutate();
  }, [token, mutate]);
  return { token, lookup };
}

function SignedInNotice() {
  const { session } = useServices();
  const current = useSession();
  const { t } = useI18n();
  if (!current) return null;
  return (
    <div className="link-state">
      <p className="auth__hint">{t('join.signedIn', { name: current.staff.name })}</p>
      <button type="button" className="btn btn--ghost btn--block" onClick={() => session.set(null)}>
        {t('shell.signOut')}
      </button>
    </div>
  );
}

function LinkBody<T>({
  token,
  lookup,
  children,
}: {
  token: string;
  lookup: { data?: T; error: unknown; isPending: boolean; mutate: () => void };
  children: (preview: T) => ReactNode;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const current = useSession();
  if (current) return <SignedInNotice />;
  if (!token || isInvalidLink(lookup.error)) return <InvalidLink />;
  if (lookup.error) {
    return (
      <div className="link-state" role="alert">
        <p className="form-error">{describeError(lookup.error, i18n)}</p>
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => lookup.mutate()}
        >
          {t('board.retry')}
        </button>
      </div>
    );
  }
  if (!lookup.data) {
    return (
      <p className="auth__hint" role="status">
        {t('join.checking')}
      </p>
    );
  }
  return <>{children(lookup.data)}</>;
}

/** Aceptar una invitación al equipo (`/admin/join#<token>`): nombre y contraseña, y adentro. */
export function JoinPage() {
  const { client, session } = useServices();
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const { data: tenant } = useTenant();
  const { token, lookup } = useLinkPreview<InvitationPreview>(
    '/staff/auth/invitation/lookup',
    (data) => invitationPreviewSchema.parse(data),
  );
  const [name, setName] = useState('');
  const { password, validate, fields } = usePasswordFields();
  const accept = useMutation({
    mutationFn: () =>
      client.request<StaffAuthResponse>('/staff/auth/invitation/accept', {
        method: 'POST',
        auth: false,
        body: { token, name: name.trim(), password },
        schema: staffAuthResponseSchema,
      }),
    onSuccess: (response) => {
      session.set(response);
      navigate('/orders', { replace: true });
    },
  });

  const brand = brandName(tenant);
  useEffect(() => {
    document.title = t('join.pageTitle', { brand });
  }, [t, brand]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accept.isPending || !name.trim() || !validate()) return;
    accept.mutate();
  };

  return (
    <AuthFrame>
      <LinkBody token={token} lookup={lookup}>
        {(preview) =>
          isInvalidLink(accept.error) ? (
            <InvalidLink />
          ) : (
            <form className="auth__fields" onSubmit={submit}>
              <h1 className="auth__title">{t('join.title', { brand: preview.brandName })}</h1>
              <p className="auth__hint">
                {t('join.subtitle', { role: t(`role.${preview.role}`), email: preview.email })}
              </p>
              <label className="field">
                <span className="field__label">{t('join.name')}</span>
                <input
                  className="field__input"
                  autoComplete="name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {fields}
              {accept.error && (
                <p className="form-error" role="alert">
                  {describeError(accept.error, i18n)}
                </p>
              )}
              <button
                type="submit"
                className="btn btn--primary btn--block btn--large"
                disabled={accept.isPending}
              >
                {accept.isPending ? t('join.submitting') : t('join.submit')}
              </button>
            </form>
          )
        }
      </LinkBody>
    </AuthFrame>
  );
}

/** Contraseña nueva con el enlace que generó el dueño (`/admin/reset-password#<token>`). */
export function ResetPasswordPage() {
  const { client, session } = useServices();
  const i18n = useI18n();
  const { t } = i18n;
  const navigate = useNavigate();
  const { data: tenant } = useTenant();
  const { token, lookup } = useLinkPreview<PasswordResetPreview>(
    '/staff/auth/password-reset/lookup',
    (data) => passwordResetPreviewSchema.parse(data),
  );
  const { password, validate, fields } = usePasswordFields();
  const confirm = useMutation({
    mutationFn: () =>
      client.request<StaffAuthResponse>('/staff/auth/password-reset/confirm', {
        method: 'POST',
        auth: false,
        body: { token, password },
        schema: staffAuthResponseSchema,
      }),
    onSuccess: (response) => {
      session.set(response);
      navigate('/orders', { replace: true });
    },
  });

  const brand = brandName(tenant);
  useEffect(() => {
    document.title = t('reset.pageTitle', { brand });
  }, [t, brand]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirm.isPending || !validate()) return;
    confirm.mutate();
  };

  return (
    <AuthFrame>
      <LinkBody token={token} lookup={lookup}>
        {(preview) =>
          isInvalidLink(confirm.error) ? (
            <InvalidLink />
          ) : (
            <form className="auth__fields" onSubmit={submit}>
              <h1 className="auth__title">{t('reset.title')}</h1>
              <p className="auth__hint">{t('reset.subtitle', { email: preview.email })}</p>
              {fields}
              {confirm.error && (
                <p className="form-error" role="alert">
                  {describeError(confirm.error, i18n)}
                </p>
              )}
              <button
                type="submit"
                className="btn btn--primary btn--block btn--large"
                disabled={confirm.isPending}
              >
                {confirm.isPending ? t('reset.submitting') : t('reset.submit')}
              </button>
            </form>
          )
        }
      </LinkBody>
    </AuthFrame>
  );
}
