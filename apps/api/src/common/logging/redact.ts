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
 */

// Dígitos separados por espacio, guion o punto (`4111.1111.1111.1111`).
const PAN_CANDIDATE = /\d(?:[ .-]?\d){12,18}/g;
// Clave sensible y su valor, también en JSON escapado una o más veces (`{\"cvv\":\"737\"}`,
// típico de un body serializado dentro de otro string).
const SENSITIVE_KEY =
  /(\\*["']?\b(?:cvv2?|cvc2?|csc|cvn|card_?cvc|card_?cvv|card_?csc|security_?code|card_?number|pan|number)\b\\*["']?\s*[:=]\s*)(\\*"(?:[^"\\]|\\(?!"))*\\*"|'[^']*'|[^\s,}\]&\\]+)/gi;

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

export function redactSensitive(text: string): string {
  return text
    .replace(SENSITIVE_KEY, (_match, key: string) => `${key}"[REDACTED]"`)
    .replace(PAN_CANDIDATE, (candidate) => {
      const digits = candidate.replace(/[ .-]/g, '');
      return digits.length >= 13 && passesLuhn(digits) ? '[PAN]' : candidate;
    });
}
