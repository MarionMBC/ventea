/**
 * Redacción de datos de tarjeta en texto de log (TASK-005). Red de seguridad: ningún código
 * loguea el PAN ni el CVV a propósito, pero un error con el body adentro, un `JSON.stringify`
 * de más o el mensaje crudo de una pasarela no pueden dejar uno en los logs (un PAN en un log
 * es un incidente PCI DSS por sí solo).
 *
 * - Secuencias de 13 a 19 dígitos (con espacios o guiones) que pasan Luhn → `[PAN]`. Luhn
 *   evita tachar ids y timestamps largos que no son tarjetas.
 * - El valor de claves sensibles (`cvv`, `cvc`, `securityCode`, `number`, `cardNumber`…) en
 *   JSON o `clave=valor` → `[REDACTED]`, sea cual sea el valor.
 * - Push (TASK-016): bloques PEM de clave privada, y el valor de `private_key`/`privateKey`,
 *   `access_token`/`accessToken`, `assertion` (JWT de la service account), `pushToken` y
 *   `pushCredentialsEnc` → `[REDACTED]`.
 * - Correo (TASK-021): el valor de `smtp_url`/`SMTP_URL`, y la clave de cualquier URL con
 *   usuario y clave (`smtps://usuario:clave@host`) → `smtps://usuario:[REDACTED]@host`.
 */

// Dígitos separados por espacio, guion, punto o barra (`4111.1111.1111.1111`).
const PAN_CANDIDATE = /\d(?:[ ./-]?\d){12,18}/g;
// Clave sensible y su valor, también en JSON escapado una o más veces (`{\"cvv\":\"737\"}`,
// típico de un body serializado dentro de otro string).
const SENSITIVE_KEY =
  /(\\*["']?\b(?:cvv2?|cvc2?|csc|cvn|card_?cvc|card_?cvv|card_?csc|security_?code|card_?number|pan|number|private_?key|access_?token|assertion|push_?token|push_?credentials_?enc|smtp_?url)\b\\*["']?\s*[:=]\s*)(\\*"(?:[^"\\]|\\(?!"))*\\*"|'[^']*'|[^\s,}\]&\\]+)/gi;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

// Clave privada PEM completa, con saltos reales o escapados (`\n` dentro de un JSON).
const PEM_PRIVATE_KEY =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

// Clave en el userinfo de una URL (`esquema://usuario:clave@host`). El usuario queda.
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)[^\s/@]+@/gi;

export function redactSensitive(text: string): string {
  return text
    .replace(URL_PASSWORD, '$1[REDACTED]@')
    .replace(PEM_PRIVATE_KEY, '[REDACTED PRIVATE KEY]')
    .replace(SENSITIVE_KEY, (_match, key: string) => `${key}"[REDACTED]"`)
    .replace(PAN_CANDIDATE, (candidate) => {
      const digits = candidate.replace(/[ ./-]/g, '');
      return digits.length >= 13 && passesLuhn(digits) ? '[PAN]' : candidate;
    });
}
