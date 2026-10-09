import { useMutation } from '@tanstack/react-query';
import { platformAuthResponseSchema, type LoginInput } from '@ventea/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { usePlatform, usePlatformSession } from './services';

interface FromState {
  from?: string;
}

/** Login de administradores de la plataforma (`POST /api/platform/auth/login`). */
export function PlatformLogin() {
  const { client, session } = usePlatform();
  const current = usePlatformSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from ?? '/plataforma';
  const expired = session.wasExpired();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    document.title = 'Plataforma · Ventea';
  }, []);

  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      client.request('/platform/auth/login', {
        method: 'POST',
        body: input,
        auth: false,
        schema: platformAuthResponseSchema,
      }),
    onSuccess: (response) => {
      session.set(response);
      navigate(from, { replace: true });
    },
  });

  if (current) return <Navigate to={from} replace />;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  return (
    <main className="login login--platform" lang="es">
      <form className="login__card" onSubmit={onSubmit}>
        <p className="login__brand">Ventea</p>
        <h1 className="login__title">Plataforma</h1>
        <p className="login__hint">Administración del SaaS: marcas, planes y suscripciones.</p>

        {expired && !login.error && (
          <p className="form-notice" role="status">
            Tu sesión expiró (dura 1 hora). Vuelve a ingresar.
          </p>
        )}

        <label className="field">
          <span className="field__label">Correo</span>
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
          <span className="field__label">Contraseña</span>
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

        {login.error && (
          <p className="form-error" role="alert">
            {login.error.message}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
