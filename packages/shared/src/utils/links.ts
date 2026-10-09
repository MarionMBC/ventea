/**
 * Links dentro de nombres de marca o de persona (TASK-021, anti-phishing). Un nombre que llega a
 * un correo (`Cuenta suspendida, entra a evil.com`) no puede quedar como link: los clientes de
 * correo convierten en link una URL o un dominio aunque el correo sea texto.
 *
 * Dos reglas distintas, las dos LINEALES (sin regex con backtracking) y con tope de largo antes
 * de mirar nada: corren sobre texto de un endpoint público.
 *
 * - `hasUnambiguousLink` (registro, cliente y API): solo lo inequívoco — `://`, `www.`, `@`, `/`.
 *   Un punto pegado NO se rechaza: `Pollo.Express`, `Lic.María`, `Tacos.mx` son nombres reales.
 * - `neutralizeLinks` (correo, la defensa real): deja el texto sin nada linkificable — quita los
 *   esquemas y cambia por un espacio el punto entre una letra/número y 2+ letras
 *   (`Pollo.Express` → `Pollo Express`, `evil.рф` → `evil рф`). Normaliza antes (NFKC y los puntos
 *   ideográficos `。` `．` `｡`).
 */

/** Más que esto no es un nombre: se corta antes de procesar (el schema ya limita a 80). */
export const LINK_CHECK_MAX = 200;

/** `true` si el nombre trae algo que solo puede ser un link o una dirección. */
export function hasUnambiguousLink(text: string): boolean {
  const value = normalizeDots(text.slice(0, LINK_CHECK_MAX)).toLowerCase();
  return (
    value.includes('://') || value.includes('www.') || value.includes('@') || value.includes('/')
  );
}

/** Sin esquemas ni dominios: lo que queda no lo convierte en link ningún cliente de correo. */
export function neutralizeLinks(text: string): string {
  const value = normalizeDots(text.slice(0, LINK_CHECK_MAX));
  return value
    .split(/(\s+)/)
    .map((token) => (/\s/.test(token) ? token : neutralizeToken(token)))
    .join('');
}

/** NFKC (`．` → `.`, `｡` → `。`) y el punto ideográfico `。` como punto. */
function normalizeDots(text: string): string {
  return text.normalize('NFKC').replace(/。/g, '.');
}

const LETTER = /^\p{L}$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;

function neutralizeToken(token: string): string {
  // Esquema: lo que va antes de `://` se descarta (`https://evil.com` → `evil.com`).
  const scheme = token.indexOf('://');
  const rest = scheme >= 0 ? token.slice(scheme + 3) : token;
  const chars = Array.from(rest);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '.') continue;
    const before = chars[i - 1];
    if (!before || !LETTER_OR_DIGIT.test(before)) continue;
    // ¿Siguen 2+ letras? (`S.A.` y `1.5` quedan: no parecen dominio).
    let letters = 0;
    for (let j = i + 1; j < chars.length && letters < 2 && LETTER.test(chars[j] ?? ''); j++) {
      letters++;
    }
    if (letters >= 2) chars[i] = ' ';
  }
  return chars.join('');
}
