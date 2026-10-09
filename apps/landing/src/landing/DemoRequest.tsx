import { useState, type FormEvent } from 'react';

import { CONTACT_EMAIL } from '@/config';

export interface DemoRequestData {
  name: string;
  restaurant: string;
  city: string;
  phone: string;
  message: string;
}

export const DEMO_SUBJECT = 'Quiero una demo de Ventea';

/**
 * `mailto:` con asunto y cuerpo prellenados. Sin backend: el correo sale del cliente de correo
 * de la persona, así nada de lo que escribe pasa por nuestros servidores.
 */
export function buildDemoMailto(data: DemoRequestData, to = CONTACT_EMAIL): string {
  const lines = [
    'Hola, quiero ver una demo de Ventea.',
    '',
    `Nombre: ${data.name.trim()}`,
    `Restaurante: ${data.restaurant.trim()}`,
  ];
  if (data.city.trim()) lines.push(`Ciudad y país: ${data.city.trim()}`);
  if (data.phone.trim()) lines.push(`Teléfono o WhatsApp: ${data.phone.trim()}`);
  if (data.message.trim()) lines.push('', data.message.trim());
  const subject = `${DEMO_SUBJECT}: ${data.restaurant.trim()}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

const EMPTY: DemoRequestData = { name: '', restaurant: '', city: '', phone: '', message: '' };

export function DemoRequest({
  navigate = (url: string) => window.location.assign(url),
}: {
  /** Inyectable en tests: abrir el `mailto:`. */
  navigate?: (url: string) => void;
}) {
  const [data, setData] = useState<DemoRequestData>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [sent, setSent] = useState(false);

  const nameError = data.name.trim().length < 2 ? 'Escriba su nombre.' : undefined;
  const restaurantError =
    data.restaurant.trim().length < 2 ? 'Escriba el nombre de su restaurante.' : undefined;

  const set = (key: keyof DemoRequestData) => (value: string) =>
    setData((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nameError || restaurantError) {
      setShowErrors(true);
      return;
    }
    navigate(buildDemoMailto(data));
    setSent(true);
  };

  return (
    <section
      className="section section--tint demo-request-section"
      id="pedir-demo"
      aria-labelledby="pedir-demo-title"
    >
      <div className="container demo-request">
        <header className="section__head demo-request__head" data-reveal>
          <p className="eyebrow">Demostración</p>
          <h2 className="section__title" id="pedir-demo-title">
            ¿Prefiere que se la mostremos?
          </h2>
          <p className="section__lead">
            Cuéntenos de su restaurante y le mostramos Ventea en una llamada corta, con sus
            preguntas.
          </p>
        </header>

        <form className="demo-request__form" onSubmit={onSubmit} noValidate>
          <Field
            id="demo-name"
            label="Su nombre"
            autoComplete="name"
            value={data.name}
            onChange={set('name')}
            error={showErrors ? nameError : undefined}
          />
          <Field
            id="demo-restaurant"
            label="Nombre del restaurante"
            autoComplete="organization"
            value={data.restaurant}
            onChange={set('restaurant')}
            error={showErrors ? restaurantError : undefined}
          />
          <Field
            id="demo-city"
            label="Ciudad y país (opcional)"
            autoComplete="address-level2"
            value={data.city}
            onChange={set('city')}
          />
          <Field
            id="demo-phone"
            label="Teléfono o WhatsApp (opcional)"
            autoComplete="tel"
            type="tel"
            value={data.phone}
            onChange={set('phone')}
          />
          <div className="field demo-request__wide">
            <label className="field__label" htmlFor="demo-message">
              ¿Algo que quiera contarnos? (opcional)
            </label>
            <textarea
              id="demo-message"
              className="field__input"
              rows={3}
              maxLength={600}
              value={data.message}
              onChange={(event) => set('message')(event.target.value)}
            />
          </div>
          <div className="demo-request__wide demo-request__actions">
            <button type="submit" className="btn btn--primary">
              Pedir una demo
            </button>
            <p className="field__hint">
              Se abre su correo con el mensaje listo para enviar a {CONTACT_EMAIL}.
            </p>
          </div>
          {sent && (
            <p className="demo-request__wide notice notice--ok" role="status">
              Si su correo no se abrió, escríbanos directo a{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field__input"
        type={type}
        autoComplete={autoComplete}
        maxLength={120}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
