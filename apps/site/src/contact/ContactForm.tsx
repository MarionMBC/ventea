import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { config } from '@/config';
import { format, type Dict } from '@/i18n';
import type { ProjectTypeId } from '@/i18n/types';
import { PROJECT_TYPE_EVENT } from '@/home/projectTypeEvent';

import {
  buildMailto,
  buildMessage,
  EMPTY_CONTACT,
  FIELD_ORDER,
  isSpam,
  LIMITS,
  plainText,
  validateContact,
  type ContactErrors,
  type ContactFields,
} from './mailto';

type Status = 'idle' | 'opening' | 'opened';
type CopyState = 'idle' | 'copied' | 'failed';

interface Props {
  t: Dict;
  to?: string;
  /** Abre el `mailto:`. Inyectable para los tests (jsdom no navega). */
  openUrl?: (url: string) => void;
  /** Copia al portapapeles. Inyectable para los tests. */
  copyText?: (text: string) => Promise<void>;
}

/** Tiempo del estado «Abrimos su aplicación de correo…» antes de mostrar las alternativas. */
const OPENING_MS = 900;

const PROJECT_TYPE_IDS: readonly ProjectTypeId[] = [
  'software',
  'apps',
  'ai',
  'architecture',
  'saas',
  'other',
];

function defaultCopy(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('sin portapapeles'));
  return navigator.clipboard.writeText(text);
}

/**
 * Formulario de contacto: valida en el cliente (errores accesibles, foco al primer campo con
 * error), descarta envíos con el honeypot lleno y abre la aplicación de correo con el mensaje
 * armado. No hay backend: nada se envía ni se guarda desde el sitio, y nunca se muestra
 * «enviado». Si la aplicación no se abre, ofrece copiar el texto o escribir directo.
 */
export function ContactForm({
  t,
  to = config.contactEmail,
  openUrl = (url) => window.location.assign(url),
  copyText = defaultCopy,
}: Props) {
  const c = t.contact;
  const [fields, setFields] = useState<ContactFields>(EMPTY_CONTACT);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [preview, setPreview] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // CTA de un servicio → tipo de proyecto preseleccionado (si la persona no eligió otro).
  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<ProjectTypeId>).detail;
      if (!PROJECT_TYPE_IDS.includes(id)) return;
      setFields((prev) => (prev.projectType ? prev : { ...prev, projectType: id }));
    };
    document.addEventListener(PROJECT_TYPE_EVENT, onSelect);
    return () => document.removeEventListener(PROJECT_TYPE_EVENT, onSelect);
  }, []);

  const update =
    (key: keyof ContactFields) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setFields((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
      if (status !== 'idle') setStatus('idle');
    };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSpam(honeypot)) return;
    const found = validateContact(fields);
    setErrors(found);
    setSubmitted(true);
    const first = FIELD_ORDER.find((key) => found[key]);
    if (first) {
      setStatus('idle');
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const mail = buildMessage(fields, c);
    setPreview(plainText(to, mail, c));
    setCopyState('idle');
    setStatus('opening');
    openUrl(buildMailto(to, mail));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('opened'), OPENING_MS);
  };

  const onCopy = () => {
    copyText(preview).then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    );
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const describedBy = (key: keyof ContactFields, ...extra: string[]) =>
    [...extra, errors[key] ? `contact-${key}-error` : undefined].filter(Boolean).join(' ') ||
    undefined;

  const error = (key: keyof ContactFields) => {
    const code = errors[key];
    return code ? (
      <p className="field__error" id={`contact-${key}-error`}>
        {c.errors[code]}
      </p>
    ) : null;
  };

  return (
    <form ref={formRef} className="contact-form" noValidate onSubmit={onSubmit}>
      <p className="contact-form__summary" role="alert">
        {submitted && hasErrors ? c.form.errorsSummary : ''}
      </p>
      <div className="contact-form__row">
        <div className="field">
          <label htmlFor="contact-name">{c.form.name}</label>
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
          <label htmlFor="contact-email">{c.form.email}</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            maxLength={LIMITS.email}
            value={fields.email}
            onChange={update('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy('email')}
          />
          {error('email')}
        </div>
      </div>
      <div className="contact-form__row">
        <div className="field">
          <label htmlFor="contact-company">
            {c.form.company} <span className="field__optional">{c.form.optional}</span>
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
        <div className="field">
          <label htmlFor="contact-type">{c.form.projectType}</label>
          <select
            id="contact-type"
            name="projectType"
            required
            value={fields.projectType}
            onChange={update('projectType')}
            aria-invalid={errors.projectType ? true : undefined}
            aria-describedby={describedBy('projectType')}
          >
            <option value="">{c.form.choose}</option>
            {PROJECT_TYPE_IDS.map((id) => (
              <option key={id} value={id}>
                {c.projectTypes[id]}
              </option>
            ))}
          </select>
          {error('projectType')}
        </div>
      </div>
      <div className="field">
        <label htmlFor="contact-message">{c.form.message}</label>
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
          {c.form.messageHint}{' '}
          {format(c.form.counter, { max: LIMITS.message, count: fields.message.length })}
        </p>
        {error('message')}
      </div>
      {/* Honeypot: invisible para personas y lectores de pantalla; los bots lo completan. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="contact-website">{c.form.honeypot}</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>
      <div className="contact-form__actions">
        <button type="submit" className="btn btn--primary btn--lg" aria-busy={status === 'opening'}>
          {c.form.submit}
          <span aria-hidden="true">→</span>
        </button>
        <p className="contact-form__note">{c.form.note}</p>
      </div>
      <div className="contact-form__status" role="status" aria-live="polite">
        {status === 'opening' ? <p className="status status--opening">{c.status.opening}</p> : null}
        {status === 'opened' ? (
          <div className="status status--opened">
            <p className="status__title">{c.status.openedTitle}</p>
            <p>{c.status.openedText}</p>
          </div>
        ) : null}
      </div>
      {status === 'opened' ? (
        <div className="contact-form__fallback">
          <div className="contact-form__fallback-actions">
            <button type="button" className="btn btn--outline" onClick={onCopy}>
              {c.status.copy}
            </button>
            <a className="link-arrow" href={`mailto:${to}`}>
              {c.status.writeDirect}
            </a>
          </div>
          <p className="contact-form__copy-state" aria-live="polite">
            {copyState === 'copied'
              ? c.status.copied
              : copyState === 'failed'
                ? c.status.copyFailed
                : ''}
          </p>
          <label className="contact-form__preview-label" htmlFor="contact-preview">
            {c.status.previewLabel}
          </label>
          <textarea
            id="contact-preview"
            className="contact-form__preview"
            readOnly
            rows={7}
            value={preview}
          />
        </div>
      ) : null}
    </form>
  );
}
