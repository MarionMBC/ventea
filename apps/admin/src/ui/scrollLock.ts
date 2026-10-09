import { useEffect } from 'react';

/*
 * Bloqueo del scroll de fondo para diálogos y paneles modales (regla de layout del panel,
 * `apps/admin/LAYOUT.md`). El panel scrollea con el documento, así que se bloquea `<html>`.
 * Cuenta los bloqueos: un diálogo de confirmación encima de un panel lateral no libera el
 * fondo al cerrarse mientras el panel siga abierto.
 */
let locks = 0;
let saved: { overflow: string; gutter: string } | null = null;

/** Bloquea el scroll del documento. Devuelve la función que lo libera (idempotente). */
export function lockScroll(): () => void {
  const root = document.documentElement;
  if (locks === 0) {
    saved = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    // Si había barra, se guarda su lugar: el contenido de fondo no salta de costado.
    if (root.scrollHeight > root.clientHeight) root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0 && saved) {
      root.style.overflow = saved.overflow;
      root.style.scrollbarGutter = saved.gutter;
      saved = null;
    }
  };
}

/** Bloquea el scroll de fondo mientras el componente está montado. */
export function useScrollLock(): void {
  useEffect(() => lockScroll(), []);
}
