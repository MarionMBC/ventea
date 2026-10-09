/**
 * Detección de texto con forma de link (TASK-021, anti-phishing). Un nombre de marca o de
 * persona que llega a un correo (`Cuenta suspendida, entra a evil.com`) no puede traer una URL
 * ni un dominio: los clientes de correo los convierten en link aunque el correo sea texto.
 *
 * - Esquema: `https://`, `ftp://`, `javascript:`… (cualquier `algo://`).
 * - `www.`
 * - Dominio con TLD de letras: `evil.com`, `soporte-ventea.com.hn`. No confunde iniciales
 *   (`Juan P. Pérez`), siglas (`S.A.`) ni números (`1.5`).
 */
const SCHEME = /[a-z][a-z0-9+.-]*:\/\//gi;
const WWW = /\bwww\./gi;
const DOMAIN = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/gi;

export function hasLinkLike(text: string): boolean {
  return [SCHEME, WWW, DOMAIN].some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/**
 * Deja el texto sin nada que un cliente de correo convierta en link: quita los esquemas, y en
 * `www.` y en los dominios cambia el punto por un espacio (`evil.com` → `evil com`).
 */
export function neutralizeLinks(text: string): string {
  return text
    .replace(SCHEME, '')
    .replace(WWW, 'www ')
    .replace(DOMAIN, (domain) => domain.replace(/\./g, ' '));
}
