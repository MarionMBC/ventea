/**
 * Links dentro de nombres de marca o de persona (TASK-021, anti-phishing). Un nombre que llega a
 * un correo (`Cuenta suspendida, entra a evil.com`) no puede quedar como link: los clientes de
 * correo convierten en link una URL o un dominio aunque el correo sea texto.
 *
 * Dos reglas distintas, las dos LINEALES (sin regex con backtracking) y con tope de largo antes
 * de mirar nada: corren sobre texto de un endpoint público.
 *
 * - `hasUnambiguousLink` (registro, cliente y API): solo lo inequívoco — `://`, `@`, `www.` al
 *   inicio de una palabra y `/` salvo entre dígitos. Un punto pegado NO se rechaza: `Pollo.Express`,
 *   `Lic.María`, `Tacos.mx` son nombres reales; tampoco `Comida 24/7`, `1/2` ni `Awww.Pizza`.
 * - `neutralizeLinks` (correo, la defensa real): deja el texto sin nada linkificable — quita los
 *   esquemas, cambia por un espacio el punto entre una letra/número y 2+ letras
 *   (`Pollo.Express` → `Pollo Express`, `evil.рф` → `evil рф`) y los puntos de una IPv4
 *   (`192.168.0.1` → `192 168 0 1`). Una marca combinante cuenta como letra.
 *
 * Las dos normalizan antes: quitan los invisibles (`\p{Cf}` y Default_Ignorable: U+200B, U+00AD,
 * U+2060, selectores de variante…, que esconden `evil.c\u200Bom`), NFKC y los puntos ideográficos
 * `。` `．` `｡`.
 */

/** Más que esto no es un nombre: se corta antes de procesar (el schema ya limita a 80). */
export const LINK_CHECK_MAX = 200;

/** `true` si el nombre trae algo que solo puede ser un link o una dirección. */
export function hasUnambiguousLink(text: string): boolean {
  const value = normalize(text.slice(0, LINK_CHECK_MAX)).toLowerCase();
  if (value.includes('://') || value.includes('@')) return true;
  const chars = Array.from(value);
  for (let i = 0; i < chars.length; i++) {
    // `/` solo entre dígitos: `24/7`, `1/2` (no `evil/login`, `24/ 7`).
    if (chars[i] === '/' && !(isDigit(chars[i - 1]) && isDigit(chars[i + 1]))) return true;
    // `www.` al inicio de una palabra: `Awww.Pizza` es un nombre.
    if (
      chars[i] === 'w' &&
      chars[i + 1] === 'w' &&
      chars[i + 2] === 'w' &&
      chars[i + 3] === '.' &&
      !LETTER_OR_DIGIT.test(chars[i - 1] ?? '')
    ) {
      return true;
    }
  }
  return false;
}

/** Sin esquemas ni dominios: lo que queda no lo convierte en link ningún cliente de correo. */
export function neutralizeLinks(text: string): string {
  const value = normalize(text.slice(0, LINK_CHECK_MAX));
  return value
    .split(/(\s+)/)
    .map((token) => (/\s/.test(token) ? token : neutralizeToken(token)))
    .join('');
}

/**
 * Sin invisibles (`\p{Cf}`, Default_Ignorable), NFKC (`．` → `.`, `｡` → `。`) y el punto ideográfico
 * `。` como punto. Clases de un carácter con `g`: lineal.
 */
function normalize(text: string): string {
  return text
    .replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '')
    .normalize('NFKC')
    .replace(/。/g, '.');
}

/** Letra o marca combinante (`c\u0332` es una letra para quien linkifica). */
const LETTER = /^[\p{L}\p{M}]$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{M}\p{N}]$/u;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

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
  neutralizeIpv4(chars);
  return chars.join('');
}

/**
 * IPv4 sin esquema (`192.168.0.1`): en cada tramo de dígitos y puntos con 4+ grupos de 1 a 3
 * dígitos, los puntos pasan a espacio. Un recorrido, sin regex. `1.5` y `2.0.1` quedan.
 */
function neutralizeIpv4(chars: string[]): void {
  let start = 0;
  while (start < chars.length) {
    if (!isDigit(chars[start])) {
      start++;
      continue;
    }
    let end = start;
    let groups = 1;
    let groupLength = 0;
    let valid = true;
    for (; end < chars.length && (isDigit(chars[end]) || chars[end] === '.'); end++) {
      if (chars[end] === '.') {
        if (groupLength === 0) valid = false;
        groups++;
        groupLength = 0;
      } else if (++groupLength > 3) {
        valid = false;
      }
    }
    // Un punto final (`1.2.3.4.`) no es un grupo.
    if (chars[end - 1] === '.') groups--;
    if (valid && groups >= 4) {
      for (let k = start; k < end; k++) if (chars[k] === '.') chars[k] = ' ';
    }
    start = end;
  }
}
