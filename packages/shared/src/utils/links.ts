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
 * `。` `．` `｡`. `neutralizeLinks` conserva ZWNJ/ZWJ/selectores entre letras o emoji (ver `normalize`).
 */

/** Más que esto no es un nombre: se corta antes de procesar (el schema ya limita a 80). */
export const LINK_CHECK_MAX = 200;

/** `true` si el nombre trae algo que solo puede ser un link o una dirección. */
export function hasUnambiguousLink(text: string): boolean {
  const value = normalize(text.slice(0, LINK_CHECK_MAX), false).toLowerCase();
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
  const value = normalize(text.slice(0, LINK_CHECK_MAX), true);
  return value
    .split(/(\s+)/)
    .map((token) => (/\s/.test(token) ? token : neutralizeToken(token)))
    .join('');
}

/**
 * Sin invisibles (`\p{Cf}`, Default_Ignorable), NFKC (`．` → `.`, `｡` → `。`) y el punto ideográfico
 * `。` como punto. Con `keepJoiners` (el texto que sale en el correo) se conservan ZWNJ, ZWJ y los
 * selectores de variante ENTRE dos letras/marcas/emoji: los usan el persa (`می\u200Cخواهم`) y los emoji
 * compuestos (👨\u200D👩\u200D👧). Junto a un punto, un dígito o un espacio se quitan igual, y `neutralizeToken`
 * los salta al contar letras: no esconden un dominio. Un recorrido; regex de un carácter.
 */
function normalize(text: string, keepJoiners: boolean): string {
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    if (!INVISIBLE.test(char)) {
      out += char;
      continue;
    }
    if (keepJoiners && JOINER.test(char) && isWordish(chars[i - 1]) && isWordish(chars[i + 1])) {
      out += char;
    }
  }
  return out.normalize('NFKC').replace(/。/g, '.');
}

const INVISIBLE = /^[\p{Cf}\p{Default_Ignorable_Code_Point}]$/u;
/** ZWNJ, ZWJ y selectores de variante de texto/emoji. */
const JOINERS = new Set(['\u200C', '\u200D', '\uFE0E', '\uFE0F']);
const JOINER = { test: (char: string): boolean => JOINERS.has(char) };
const WORDISH = /^[\p{L}\p{M}\p{Extended_Pictographic}]$/u;

function isWordish(char: string | undefined): boolean {
  return char !== undefined && WORDISH.test(char);
}

/** Letra o marca combinante (`c\u0332` es una letra para quien linkifica). */
const LETTER = /^[\p{L}\p{M}]$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{M}\p{N}]$/u;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function neutralizeToken(token: string): string {
  // Esquemas: todo lo que va antes del ÚLTIMO `://` se descarta (`https://evil.com` →
  // `evil.com`; `https://https://evil.com` también).
  const scheme = token.lastIndexOf('://');
  const rest = scheme >= 0 ? token.slice(scheme + 3) : token;
  const chars = Array.from(rest);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '.') continue;
    const before = chars[i - 1];
    if (!before || !LETTER_OR_DIGIT.test(before)) continue;
    // ¿Siguen 2+ letras? (`S.A.` y `1.5` quedan: no parecen dominio).
    // Los unidores que conservó `normalize` (entre letras) no cortan la cuenta.
    let letters = 0;
    for (let j = i + 1; j < chars.length && letters < 2; j++) {
      const next = chars[j] ?? '';
      if (JOINER.test(next)) continue;
      if (!LETTER.test(next)) break;
      letters++;
    }
    if (letters >= 2) chars[i] = ' ';
  }
  neutralizeIpv4(chars);
  return chars.join('');
}

/**
 * IPv4 sin esquema (`192.168.0.1`): en cada tramo de dígitos y puntos, toda cadena de 4+ grupos
 * de dígitos separados por UN punto pasa a espacios. Un `..` corta la cadena sin descartar el
 * resto (`1..8.8.8.8` → `1..8 8 8 8`); un grupo largo cuenta (`1234.8.8.8.8`: un linkificador
 * puede tomar su cola). `1.5` y `2.0.1` quedan. Un recorrido, sin regex.
 */
function neutralizeIpv4(chars: string[]): void {
  let i = 0;
  while (i < chars.length) {
    if (!isDigit(chars[i])) {
      i++;
      continue;
    }
    // Cadena desde `i`: grupo, punto, grupo, … hasta algo que no sea dígito ni un punto simple.
    const start = i;
    let groups = 0;
    let end = i;
    while (end < chars.length && isDigit(chars[end])) {
      while (end < chars.length && isDigit(chars[end])) end++;
      groups++;
      if (chars[end] === '.' && isDigit(chars[end + 1])) end++;
      else break;
    }
    if (groups >= 4) {
      for (let k = start; k < end; k++) if (chars[k] === '.') chars[k] = ' ';
    }
    i = end;
  }
}
