import type { CSSProperties } from 'react';

/** Variables CSS en `style` (p. ej. `--i` para escalonar revelados) con tipos de React. */
export function cssVars(vars: Readonly<Record<`--${string}`, string | number>>): CSSProperties {
  return vars as CSSProperties;
}
