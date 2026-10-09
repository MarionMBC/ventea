import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * `false` en el HTML prerenderizado y durante la hidratación; `true` en cuanto React controla la
 * página en el cliente. Sin desajuste de hidratación (React usa el snapshot del servidor al
 * hidratar y vuelve a renderizar con el del cliente) y sin setState dentro de un efecto.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
