import { useMutation } from '@tanstack/react-query';
import { staffAuthResponseSchema, type LoginInput } from '@ventea/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useServices, useSession } from '@/app/services';
import { brandStyle, useTenant } from '@/app/tenant';
import { describeError, useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { BrandMark, brandName } from '@/ui/Brand';
import { IconBilling, IconHistory, IconOrders } from '@/ui/icons';
import { LangSwitch } from '@/ui/LangSwitch';

interface FromState {
  from?: string;
}

/** Login del staff (`POST /api/staff/auth/login`). El tenant lo pone el subdominio. */
export function LoginPage() {
  const { client, session } = useServices();
  const current = useSession();
  const { data: tenant } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from ?? '/orders';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      client.request('/staff/auth/login', {
        method: 'POST',
        body: input,
        auth: false,
        schema: staffAuthResponseSchema,
      }),
    onSuccess: (response) => {
      session.set(response);
      navigate(from, { replace: true });
    },
  });

  const name = brandName(tenant);
  useEffect(() => {
    document.title = t('login.pageTitle', { brand: name });
  }, [t, name]);

  if (current) return <Navigate to={from} replace />;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  // 401 en el login = credenciales: se muestra un texto propio, traducido.
  const errorText =
    login.error &&
    (login.error instanceof ApiError && login.error.status === 401 && !login.error.kind
      ? t('login.invalid')
      : describeError(login.error, t));

  return (
    <main className="auth" style={brandStyle(tenant)}>
      <section className="auth__brand" aria-hidden="true">
        <div className="auth__brand-inner">
          <BrandMark tenant={tenant} size={56} />
          <p className="auth__brand-name">{name}</p>
          <p className="auth__tagline">{t('login.tagline')}</p>
          <ul className="auth__features">
            <li>
              <IconOrders size={20} /> {t('nav.orders')}
            </li>
            <li>
              <IconHistory size={20} /> {t('nav.history')}
            </li>
            <li>
              <IconBilling size={20} /> {t('nav.billing')}
            </li>
          </ul>
        </div>
      </section>

      <section className="auth__panel">
        <div className="auth__top">
          <LangSwitch />
        </div>
        <form className="auth__form" onSubmit={onSubmit}>
          <div className="auth__head">
            <span className="auth__mobile-mark">
              <BrandMark tenant={tenant} size={44} />
            </span>
            <p className="auth__eyebrow">{name}</p>
            <h1 className="auth__title">{t('login.title')}</h1>
            <p className="auth__hint">{t('login.subtitle')}</p>
          </div>

          <label className="field">
            <span className="field__label">{t('login.email')}</span>
            <input
              className="field__input"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('login.password')}</span>
            <input
              className="field__input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {errorText && (
            <p className="form-error" role="alert">
              {errorText}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--block btn--large"
            disabled={login.isPending}
          >
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
        <p className="powered auth__powered">{t('app.poweredBy')}</p>
      </section>
    </main>
  );
}
