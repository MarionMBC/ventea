import { useState, type FormEvent } from 'react';

import { CONTACT_EMAIL } from '@/config';
import { MESSAGES, useLocale, useT, type Locale } from '@/i18n';

export interface DemoRequestData {
  name: string;
  restaurant: string;
  city: string;
  phone: string;
  message: string;
}

/**
 * `mailto:` con asunto y cuerpo prellenados, en el idioma de la vista. Sin backend: el correo
 * sale del cliente de correo de la persona, así nada de lo que escribe pasa por nuestros
 * servidores.
 */
export function buildDemoMailto(
  data: DemoRequestData,
  locale: Locale = 'en',
  to = CONTACT_EMAIL,
): string {
  const mail = MESSAGES[locale].demo.mail;
  const lines = [
    mail.greeting,
    '',
    `${mail.name}: ${data.name.trim()}`,
    `${mail.restaurant}: ${data.restaurant.trim()}`,
  ];
  if (data.city.trim()) lines.push(`${mail.city}: ${data.city.trim()}`);
  if (data.phone.trim()) lines.push(`${mail.phone}: ${data.phone.trim()}`);
  if (data.message.trim()) lines.push('', data.message.trim());
  const subject = `${mail.subject}: ${data.restaurant.trim()}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

const EMPTY: DemoRequestData = { name: '', restaurant: '', city: '', phone: '', message: '' };

export function DemoRequest({
  navigate = (url: string) => window.location.assign(url),
}: {
  /** Inyectable en tests: abrir el `mailto:`. */
  navigate?: (url: string) => void;
}) {
  const d = useT().demo;
  const locale = useLocale();
  const [data, setData] = useState<DemoRequestData>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [sent, setSent] = useState(false);

  const nameError = data.name.trim().length < 2 ? d.nameError : undefined;
  const restaurantError = data.restaurant.trim().length < 2 ? d.restaurantError : undefined;

  const set = (key: keyof DemoRequestData) => (value: string) =>
    setData((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nameError || restaurantError) {
      setShowErrors(true);
      return;
    }
    navigate(buildDemoMailto(data, locale));
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
          <p className="eyebrow">{d.eyebrow}</p>
          <h2 className="section__title" id="pedir-demo-title">
            {d.title}
          </h2>
          <p className="section__lead">{d.lead}</p>
        </header>

        <form className="demo-request__form" onSubmit={onSubmit} noValidate>
          <Field
            id="demo-name"
            label={d.name}
            autoComplete="name"
            value={data.name}
            onChange={set('name')}
            error={showErrors ? nameError : undefined}
          />
          <Field
            id="demo-restaurant"
            label={d.restaurant}
            autoComplete="organization"
            value={data.restaurant}
            onChange={set('restaurant')}
            error={showErrors ? restaurantError : undefined}
          />
          <Field
            id="demo-city"
            label={d.city}
            autoComplete="address-level2"
            value={data.city}
            onChange={set('city')}
          />
          <Field
            id="demo-phone"
            label={d.phone}
            autoComplete="tel"
            type="tel"
            value={data.phone}
            onChange={set('phone')}
          />
          <div className="field demo-request__wide">
            <label className="field__label" htmlFor="demo-message">
              {d.message}
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
              {d.submit}
            </button>
            <p className="field__hint">{d.hint(CONTACT_EMAIL)}</p>
          </div>
          {sent && (
            <p className="demo-request__wide notice notice--ok" role="status">
              {d.sentBefore}
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
