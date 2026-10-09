import { useRef, useState, type DragEvent } from 'react';

import { moveBefore } from './reorder';

export interface DragRowProps {
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  'data-drop-target'?: boolean;
  'data-dragging'?: boolean;
}

/**
 * Arrastrar para reordenar una lista (drag & drop nativo del navegador, sin dependencias). Cada
 * lista tiene su propio estado: soltar un ítem de otra categoría no hace nada. Es el atajo del
 * mouse; con teclado o en pantallas táctiles se usan los botones subir/bajar.
 */
export function useDragReorder(
  ids: readonly string[],
  onReorder: (ids: string[], movedId: string) => void,
  enabled: boolean,
) {
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const reset = () => {
    dragging.current = null;
    setOver(null);
    setActive(null);
  };

  return (id: string): DragRowProps => {
    if (!enabled) return {};
    return {
      draggable: true,
      onDragStart: (event) => {
        event.stopPropagation();
        dragging.current = id;
        setActive(id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
      },
      onDragOver: (event) => {
        // Algo de otra lista (o un archivo) no se puede soltar acá.
        if (!dragging.current) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        if (dragging.current !== id) setOver(id);
      },
      onDragLeave: () => setOver((current) => (current === id ? null : current)),
      onDrop: (event) => {
        const from = dragging.current;
        if (!from) return;
        event.preventDefault();
        event.stopPropagation();
        reset();
        if (from !== id) onReorder(moveBefore(ids, from, id), from);
      },
      onDragEnd: reset,
      'data-drop-target': over === id || undefined,
      'data-dragging': active === id || undefined,
    };
  };
}
