import { useId, useState } from 'react';

import { MIN_PASSWORD_LENGTH, passwordStrength, STRENGTH_LABEL } from '@/lib/format';

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
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  const missing = Math.max(0, MIN_PASSWORD_LENGTH - value.length);

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Contraseña
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
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <div className="meter" data-strength={strength} aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= strength ? 'is-on' : undefined} />
        ))}
      </div>
      <p className="field__hint" id={`${id}-hint`} aria-live="polite">
        {value.length === 0
          ? `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Mezcla mayúsculas, números y símbolos.`
          : missing > 0
            ? `Faltan ${missing} ${missing === 1 ? 'carácter' : 'caracteres'}.`
            : `Seguridad: ${STRENGTH_LABEL[strength]}.`}
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
