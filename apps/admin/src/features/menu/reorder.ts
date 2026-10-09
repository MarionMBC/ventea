/** Reorden de listas del menú (categorías, ítems, opciones, grupos de un ítem). Funciones puras. */

/** `list` con el elemento de `from` movido a `to` (índices fuera de rango → la misma lista). */
export function moveIndex<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Mueve el id `delta` posiciones (−1 sube, +1 baja). */
export function moveId(ids: readonly string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  return moveIndex(ids, from, from + delta);
}

/** Mueve `id` a la posición de `target` (soltar arrastrando sobre otro elemento). */
export function moveBefore(ids: readonly string[], id: string, target: string): string[] {
  return moveIndex(ids, ids.indexOf(id), ids.indexOf(target));
}

/** Cuerpo de `PATCH …/reorder`: el orden de la lista es el `sortOrder`. */
export function reorderBody(ids: readonly string[]): {
  items: { id: string; sortOrder: number }[];
} {
  return { items: ids.map((id, sortOrder) => ({ id, sortOrder })) };
}

/** Reordena `items` según `ids` (los que no están en `ids` quedan al final, en su orden). */
export function sortByIds<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}
