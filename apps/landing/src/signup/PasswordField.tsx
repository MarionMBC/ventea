import { useId, useState } from 'react';

import { useT } from '@/i18n';
import { MIN_PASSWORD_LENGTH, passwordStrength } from '@/lib/format';

/** Contraseña con mostrar/ocultar y medidor de fuerza (mínimo 10, como la API). */
export function PasswordField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const p = useT().password;
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  const missing = Math.max(0, MIN_PASSWORD_LENGTH - value.length);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {p.label}
      </label>
      <div className="password">
        <input
          id={id}
          className="field__input"
          type={visible ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          required
          value={value}
          aria-describedby={`${id}-hint`}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password__toggle"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? p.hide : p.show}
        </button>
      </div>
      <div className="meter" data-strength={strength} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= strength ? 'is-on' : undefined} />
        ))}
      </div>
      <p className="field__hint" id={`${id}-hint`} aria-live="polite">
        {value.length === 0
          ? p.hintEmpty(MIN_PASSWORD_LENGTH)
          : missing > 0
            ? p.missing(missing)
            : p.strength(p.strengthLabels[strength])}
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
