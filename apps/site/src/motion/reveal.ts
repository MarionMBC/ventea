/**
 * Revelados al hacer scroll (TASK-009), sin librería: IntersectionObserver + transiciones CSS.
 *
 * - Solo se ocultan los `[data-reveal]` que están DEBAJO del viewport al iniciar: lo visible al
 *   cargar (hero, una sección a la que se llegó por ancla) nunca parpadea ni retrasa el LCP.
 * - Sin JS, sin IntersectionObserver o con `prefers-reduced-motion: reduce` no se toca nada: el
 *   estado por defecto del CSS es el final.
 */
export function initReveal(root: ParentNode = document): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const pending = [...root.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
    (element) => element.getBoundingClientRect().top > window.innerHeight,
  );
  if (pending.length === 0) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        element.classList.replace('reveal-pending', 'reveal-in');
        observer.unobserve(element);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  for (const element of pending) {
    element.classList.add('reveal-pending');
    observer.observe(element);
  }
  return () => observer.disconnect();
}
