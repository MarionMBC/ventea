import { useId, useState, type FormEvent } from 'react';

import { BASE_DOMAIN } from '@/config';
import { useT } from '@/i18n';
import { isSlugFormatValid, slugify } from '@/lib/format';

/**
 * «Iniciar sesión» de los restaurantes: no hay un login central, cada panel vive en
 * `<slug>.ventea.tech/admin`. Esto solo arma esa dirección y navega; no manda nada a la API.
 */
export function PanelAccess({
  navigate = (url: string) => window.location.assign(url),
}: {
  navigate?: (url: string) => void;
}) {
  const a = useT().panelAccess;
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Acepta «mi-restaurante», «mi-restaurante.ventea.tech» o la URL completa.
    const host = value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '');
    const slug = slugify(host.split('.')[0] ?? '');
    if (!isSlugFormatValid(slug)) {
      setError(a.error);
      return;
    }
    setError(undefined);
    navigate(`https://${slug}.${BASE_DOMAIN}/admin`);
  };

  return (
    <form className="access" id="acceso" onSubmit={onSubmit} noValidate>
      <label className="access__label" htmlFor={id}>
        {a.label}
      </label>
      <div className="access__row">
        <input
          id={id}
          className="access__input"
          placeholder={a.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          onChange={(event) => setValue(event.target.value)}
        />
        <span className="access__suffix" aria-hidden="true">
          .{BASE_DOMAIN}
        </span>
        <button type="submit" className="access__go">
          {a.go}
        </button>
      </div>
      {error ? (
        <p className="access__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : (
        <p className="access__hint" id={`${id}-hint`}>
          {a.hint}
        </p>
      )}
    </form>
  );
}
