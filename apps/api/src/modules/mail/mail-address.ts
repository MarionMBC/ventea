import { emailSchema } from '@ventea/shared';

/**
 * Validación de lo que va a los headers del correo (TASK-021). Un CR/LF en `to`, `from` o
 * `subject` es header injection (`Bcc:` colado por un nombre de marca); acá no pasa ninguno.
 */

// Caracteres de control (incluye CR, LF y TAB) y separadores de línea Unicode.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f\p{Zl}\p{Zp}]/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_GLOBAL = /[\x00-\x1f\x7f\p{Zl}\p{Zp}]+/gu;

export const DEFAULT_MAIL_FROM = 'Ventea <hola@ventea.tech>';

/** Dirección de destino normalizada (minúsculas, sin espacios), o `null` si no sirve. */
export function parseRecipient(raw: string): string | null {
  if (CONTROL_CHARS.test(raw)) return null;
  const parsed = emailSchema.safeParse(raw);
  // Una sola dirección: sin comas ni `;` (la sintaxis de lista la interpretaría el transporte).
  if (!parsed.success || /[,;<>"\s]/.test(parsed.data)) return null;
  return parsed.data;
}

/**
 * Lista de destinatarios de configuración (`PLATFORM_ALERT_EMAILS`), separada por comas, `;` o
 * espacios. Una dirección inválida es un error de configuración: tira (la API no arranca), en
 * vez de mandar avisos a nadie sin decirlo. Sin duplicados.
 */
export function parseRecipientList(raw: string | undefined, envKey: string): string[] {
  const items = (raw ?? '')
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const item of items) {
    const address = parseRecipient(item);
    if (!address) throw new Error(`${envKey}: dirección inválida en la lista`);
    out.add(address);
  }
  return [...out];
}

/** Remitente parseado: `Nombre <dir>` o `dir` sola. */
export interface MailSender {
  name: string | null;
  address: string;
}

/**
 * `MAIL_FROM`: `Ventea <hola@ventea.tech>` o `hola@ventea.tech`. Vacía → el default. Mal
 * formada → tira (configuración rota, la API no arranca).
 */
export function parseMailFrom(raw: string | undefined): MailSender {
  const value = raw?.trim() || DEFAULT_MAIL_FROM;
  if (CONTROL_CHARS.test(value)) throw new Error('MAIL_FROM: caracteres de control');
  const match = /^(?:([^<>"]{1,64}?)\s*<([^<>\s]+)>|([^<>\s]+))$/.exec(value);
  const address = match ? parseRecipient(match[2] ?? match[3] ?? '') : null;
  if (!match || !address)
    throw new Error('MAIL_FROM: use "Nombre <correo@dominio>" o "correo@dominio"');
  const name = match[1]?.trim() || null;
  return { name, address };
}

/**
 * Texto apto para un header (asunto): sin caracteres de control (se cambian por un espacio),
 * espacios colapsados y recortado a `max` caracteres.
 */
export function headerText(text: string, max = 150): string {
  const clean = text.replace(CONTROL_CHARS_GLOBAL, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Texto de una línea para el cuerpo (nombres de marca/persona): sin saltos ni controles. */
export function inlineText(text: string, max = 120): string {
  return headerText(text, max);
}
