/**
 * Detecta pedidos que llegaron desde la carga anterior del tablero, para resaltarlos
 * y sumarlos al contador del título. Vive fuera de React (lo lee
 * `useSyncExternalStore`): así el render no guarda estado de renders anteriores.
 *
 * La primera carga no cuenta como "nuevo": al abrir el panel nada está resaltado.
 */
export interface ArrivalTracker {
  /** Registra la lista actual y devuelve los ids que no se habían visto nunca. */
  observe(orderIds: readonly string[]): string[];
  /** Marca como vistos un pedido o, sin id, todos. */
  acknowledge(id?: string): void;
  getSnapshot(): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
}

export function createArrivalTracker(): ArrivalTracker {
  let known: Set<string> | null = null;
  let fresh: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();

  const setFresh = (next: Set<string>) => {
    const changed = next.size !== fresh.size || [...next].some((id) => !fresh.has(id));
    if (!changed) return;
    fresh = next;
    listeners.forEach((listener) => listener());
  };

  return {
    observe(orderIds) {
      if (known === null) {
        known = new Set(orderIds);
        return [];
      }
      const seen = known;
      const arrived = orderIds.filter((id) => !seen.has(id));
      arrived.forEach((id) => seen.add(id));

      // Lo que salió del tablero (entregado, cancelado) deja de contar como nuevo.
      const current = new Set(orderIds);
      setFresh(new Set([...[...fresh].filter((id) => current.has(id)), ...arrived]));
      return arrived;
    },
    acknowledge(id) {
      setFresh(id ? new Set([...fresh].filter((freshId) => freshId !== id)) : new Set());
    },
    getSnapshot: () => fresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
