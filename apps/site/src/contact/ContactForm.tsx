import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { config } from '@/config';
import { PROJECT_TYPES } from '@/content';

import {
  buildMailto,
  EMPTY_CONTACT,
  LIMITS,
  validateContact,
  type ContactErrors,
  type ContactFields,
} from './mailto';

interface Props {
  to?: string;
  /** Abre el `mailto:`. Inyectable para los tests (jsdom no navega). */
  openUrl?: (url: string) => void;
}

const ORDER: (keyof ContactFields)[] = ['name', 'company', 'email', 'projectType', 'message'];

/**
 * Formulario de contacto: valida en el cliente y abre el programa de correo del visitante con el
 * mensaje armado. No hay backend: nada se envía ni se guarda desde el sitio.
 */
export function ContactForm({
  to = config.contactEmail,
  openUrl = (url) => window.location.assign(url),
}: Props) {
  const [fields, setFields] = useState<ContactFields>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [opened, setOpened] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const update =
    (key: keyof ContactFields) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFields((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateContact(fields);
    setErrors(found);
    const first = ORDER.find((key) => found[key]);
    if (first) {
      setOpened(false);
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    openUrl(buildMailto(to, fields));
    setOpened(true);
  };

  const describedBy = (key: keyof ContactFields, hint?: string) =>
    [hint, errors[key] ? `contact-${key}-error` : undefined].filter(Boolean).join(' ') || undefined;

  const error = (key: keyof ContactFields) =>
    errors[key] ? (
      <p className="field__error" id={`contact-${key}-error`}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form ref={formRef} className="contact-form" noValidate onSubmit={onSubmit}>
      <div className="contact-form__row">
        <div className="field">
          <label htmlFor="contact-name">Name</label>
          <input
            id="contact-name"
            name="name"
            autoComplete="name"
            required
            maxLength={LIMITS.name}
            value={fields.name}
            onChange={update('name')}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy('name')}
          />
          {error('name')}
        </div>
        <div className="field">
          <label htmlFor="contact-company">
            Company <span className="field__optional">(optional)</span>
          </label>
          <input
            id="contact-company"
            name="company"
            autoComplete="organization"
            maxLength={LIMITS.company}
            value={fields.company}
            onChange={update('company')}
          />
        </div>
      </div>
      <div className="contact-form__row">
        <div className="field">
          <label htmlFor="contact-email">Work email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={LIMITS.email}
            value={fields.email}
            onChange={update('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy('email')}
          />
          {error('email')}
        </div>
        <div className="field">
          <label htmlFor="contact-type">Project type</label>
          <select
            id="contact-type"
            name="projectType"
            required
            value={fields.projectType}
            onChange={update('projectType')}
            aria-invalid={errors.projectType ? true : undefined}
            aria-describedby={describedBy('projectType')}
          >
            <option value="">Choose one…</option>
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          {error('projectType')}
        </div>
      </div>
      <div className="field">
        <label htmlFor="contact-message">What do you need?</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={LIMITS.message}
          value={fields.message}
          onChange={update('message')}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describedBy('message', 'contact-message-hint')}
        />
        <p className="field__hint" id="contact-message-hint">
          The problem you want to solve, the systems involved and any deadline.
        </p>
        {error('message')}
      </div>
      <div className="contact-form__actions">
        <button type="submit" className="btn btn--primary">
          Open email with my message
        </button>
        <p className="contact-form__note">
          Opens your email app with the message ready to send to <a href={`mailto:${to}`}>{to}</a>.
          Nothing is stored on this site.
        </p>
      </div>
      <p className="contact-form__status" role="status">
        {opened
          ? `Your email app should open with the message ready. If it did not, write to ${to}.`
          : ''}
      </p>
    </form>
  );
}
