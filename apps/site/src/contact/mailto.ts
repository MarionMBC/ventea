/**
 * Formulario de contacto sin backend (TASK-008/009): arma un `mailto:` prellenado. Funciones
 * puras, testeables sin DOM. Nunca se dice «enviado»: el correo lo envía la persona desde su
 * propia aplicación.
 */
import { format, type Dict } from '@/i18n';
import type { ProjectTypeId } from '@/i18n/types';

export interface ContactFields {
  name: string;
  company: string;
  email: string;
  projectType: ProjectTypeId | '';
  message: string;
}

/** Cada error apunta a su texto en `dict.contact.errors`. */
export type ContactErrorCode = keyof Dict['contact']['errors'];
export type ContactErrors = Partial<Record<keyof ContactFields, ContactErrorCode>>;

export const EMPTY_CONTACT: ContactFields = {
  name: '',
  company: '',
  email: '',
  projectType: '',
  message: '',
};

/** Orden de los campos en pantalla: el foco va al primero con error. */
export const FIELD_ORDER: readonly (keyof ContactFields)[] = [
  'name',
  'email',
  'company',
  'projectType',
  'message',
];

/** Lo justo para detectar un correo mal escrito; el cliente de correo valida el resto. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `message` corto: algunos clientes de correo (Outlook clásico) cortan URLs mailto largas. */
export const LIMITS = { name: 100, company: 100, email: 254, message: 1000 } as const;
export const MIN_MESSAGE = 10;

export function validateContact(fields: ContactFields): ContactErrors {
  const errors: ContactErrors = {};
  if (!fields.name.trim()) errors.name = 'name';
  if (!fields.email.trim()) errors.email = 'email';
  else if (!EMAIL_RE.test(fields.email.trim())) errors.email = 'emailInvalid';
  if (!fields.projectType) errors.projectType = 'projectType';
  if (fields.message.trim().length < MIN_MESSAGE) errors.message = 'message';
  return errors;
}

/** Honeypot: un humano no ve ni completa el campo; si trae algo, no se abre nada. */
export function isSpam(honeypot: string): boolean {
  return honeypot.trim().length > 0;
}

/** Una sola línea: CR/LF (o cualquier control) pegados en un campo no pueden partir el asunto. */
function oneLine(value: string): string {
  const printable = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f ? ' ' : char;
  }).join('');
  return printable.replace(/\s+/g, ' ').trim();
}

export interface Mail {
  subject: string;
  body: string;
}

export function buildMessage(fields: ContactFields, copy: Dict['contact']): Mail {
  const name = oneLine(fields.name);
  const company = oneLine(fields.company);
  const type = fields.projectType ? copy.projectTypes[fields.projectType] : '';
  const who = company ? `${name}, ${company}` : name;
  const subject = oneLine(format(copy.mail.subject, { type, who }));
  const body = [
    `${copy.mail.name}: ${name}`,
    `${copy.mail.company}: ${company || '—'}`,
    `${copy.mail.email}: ${oneLine(fields.email)}`,
    `${copy.mail.projectType}: ${type}`,
    '',
    fields.message.trim().replace(/\r\n?/g, '\n'),
  ].join('\r\n');
  return { subject, body };
}

/**
 * `mailto:` con asunto y cuerpo. `encodeURIComponent` (no URLSearchParams): los clientes de correo
 * muestran `+` literal en vez de espacio. Saltos de línea del cuerpo como CRLF (RFC 6068).
 */
export function buildMailto(to: string, mail: Mail): string {
  const body = mail.body.replace(/\r?\n/g, '\r\n');
  return `mailto:${to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(body)}`;
}

/** Texto para copiar si la aplicación de correo no se abrió. */
export function plainText(to: string, mail: Mail, copy: Dict['contact']): string {
  return `${copy.mail.to}: ${to}\n${copy.mail.subjectLabel}: ${mail.subject}\n\n${mail.body.replace(/\r\n/g, '\n')}`;
}
