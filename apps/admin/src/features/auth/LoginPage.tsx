import { useMutation } from '@tanstack/react-query';
import { staffAuthResponseSchema, type LoginInput } from '@ventea/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useServices, useSession } from '@/app/services';
import { brandStyle, useTenant } from '@/app/tenant';

interface FromState {
  from?: string;
}

/** Login del staff (`POST /api/staff/auth/login`). El tenant lo pone el subdominio. */
export function LoginPage() {
  const { client, session } = useServices();
  const current = useSession();
  const { data: tenant } = useTenant();
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

  if (current) return <Navigate to={from} replace />;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  const brandName = tenant?.branding.appDisplayName ?? tenant?.name;

  return (
    <main className="login" style={brandStyle(tenant)}>
      <form className="login__card" onSubmit={onSubmit}>
        <p className="login__brand">{brandName ?? 'Ventea'}</p>
        <h1 className="login__title">Panel del local</h1>
        <p className="login__hint">Ingresa con tu cuenta de staff.</p>

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
