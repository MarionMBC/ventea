/**
 * Formulario de contacto sin backend (TASK-008): arma un `mailto:` prellenado. Funciones puras,
 * testeables sin DOM.
 */

export interface ContactFields {
  name: string;
  company: string;
  email: string;
  projectType: string;
  message: string;
}

export type ContactErrors = Partial<Record<keyof ContactFields, string>>;

export const EMPTY_CONTACT: ContactFields = {
  name: '',
  company: '',
  email: '',
  projectType: '',
  message: '',
};

/** Lo justo para detectar un correo mal escrito; el cliente de correo valida el resto. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITS = { name: 100, company: 100, email: 254, message: 2000 } as const;

export function validateContact(fields: ContactFields): ContactErrors {
  const errors: ContactErrors = {};
  if (!fields.name.trim()) errors.name = 'Please enter your name.';
  if (!fields.email.trim()) errors.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(fields.email.trim()))
    errors.email = 'Please enter a valid email, like name@company.com.';
  if (!fields.projectType) errors.projectType = 'Please choose a project type.';
  if (fields.message.trim().length < 10)
    errors.message = 'Please tell us a bit about your project (at least 10 characters).';
  return errors;
}

/**
 * `mailto:` con asunto y cuerpo. `encodeURIComponent` (no URLSearchParams): los clientes de
 * correo muestran `+` literal en vez de espacio. Saltos de línea como CRLF (RFC 6068).
 */
export function buildMailto(to: string, fields: ContactFields): string {
  const name = fields.name.trim();
  const company = fields.company.trim();
  const subject = `${fields.projectType} project — ${company ? `${name}, ${company}` : name}`;
  const body = [
    `Name: ${name}`,
    `Company: ${company || '—'}`,
    `Email: ${fields.email.trim()}`,
    `Project type: ${fields.projectType}`,
    '',
    fields.message.trim(),
  ].join('\r\n');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Link de WhatsApp; `null` si no hay número configurado. */
export function whatsappUrl(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
