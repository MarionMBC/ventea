import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Movimiento de la landing sin librerías (TASK-010): transiciones CSS + IntersectionObserver.
 * Lo que se anima es transform/opacity, nada mueve el layout, y nada secuestra el scroll.
 */

const REDUCED = '(prefers-reduced-motion: reduce)';

/** `prefers-reduced-motion`. En el servidor es `false`, así el HTML prerenderizado coincide. */
function subscribeReduced(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(REDUCED);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * Revelado al entrar en pantalla de todo `[data-reveal]` de la página. El HTML llega visible
 * (prerender y sin JS se lee todo): solo lo que está por debajo del pliegue al cargar pasa a
 * `data-reveal="pending"` y se revela al acercarse. Con movimiento reducido no se oculta nada.
 */
export function useRevealOnScroll(): void {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.(REDUCED).matches) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const fold = window.innerHeight;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = 'in';
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    for (const node of nodes) {
      if (node.getBoundingClientRect().top < fold) continue;
      node.dataset.reveal = 'pending';
      observer.observe(node);
    }
    return () => {
      observer.disconnect();
      for (const node of nodes) node.dataset.reveal = 'in';
    };
  }, []);
}

/** `true` una vez que el elemento entró en pantalla (para arrancar una secuencia). */
export function useInView<T extends Element>(
  ref: { current: T | null },
  threshold = 0.35,
): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      // Sin IntersectionObserver (navegadores viejos, jsdom): se muestra ya.
      const id = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}

/**
 * Paso actual de una secuencia que avanza sola cada `ms` mientras `playing`. Con movimiento
 * reducido no avanza sola (WCAG 2.2.2: lo que se mueve más de 5 s se puede pausar).
 */
export function useSequence(length: number, ms: number, playing: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setStep((current) => (current + 1) % length), ms);
    return () => window.clearInterval(id);
  }, [length, ms, playing]);
  return [step, setStep] as const;
}
