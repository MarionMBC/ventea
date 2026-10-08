import { useEffect, useState } from 'react';

import { checkSlug } from '@/lib/api';
import { isSlugFormatValid } from '@/lib/format';

export type SlugStatus =
  | 'empty'
  | 'checking'
  | 'available'
  | 'taken'
  | 'reserved'
  | 'invalid'
  /** No se pudo consultar (red): se deja seguir; la API lo valida igual al registrar. */
  | 'unknown';

export const SLUG_DEBOUNCE_MS = 400;

/**
 * Disponibilidad del slug en vivo: espera a que la persona deje de escribir
 * (`SLUG_DEBOUNCE_MS`), cancela la consulta anterior y descarta respuestas viejas.
 * `markTaken` lo marca tomado sin consultar (tras un 409 del registro).
 */
export function useSlugCheck(slug: string): {
  status: SlugStatus;
  markTaken: () => void;
} {
  const [result, setResult] = useState<{ slug: string; status: SlugStatus } | null>(null);

  const formatOk = isSlugFormatValid(slug);

  useEffect(() => {
    if (!formatOk) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      checkSlug(slug, { signal: controller.signal })
        .then((answer) =>
          setResult({
            slug,
            status: answer.available ? 'available' : (answer.reason ?? 'taken'),
          }),
        )
        .catch(() => {
          if (!controller.signal.aborted) setResult({ slug, status: 'unknown' });
        });
    }, SLUG_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [slug, formatOk]);

  let status: SlugStatus;
  if (!slug) status = 'empty';
  else if (!formatOk) status = 'invalid';
  else if (result?.slug === slug) status = result.status;
  else status = 'checking';

  return { status, markTaken: () => setResult({ slug, status: 'taken' }) };
}

export const SLUG_MESSAGE: Record<SlugStatus, string> = {
  empty: 'Elige la dirección de tu restaurante.',
  checking: 'Revisando si está libre…',
  available: '¡Está libre!',
  taken: 'Esa dirección ya la usa otro restaurante. Prueba con otra.',
  reserved: 'Esa dirección está reservada. Prueba con otra.',
  invalid: 'Usa de 3 a 63 letras minúsculas, números o guiones (sin espacios ni acentos).',
  unknown: 'No pudimos revisarla ahora; la confirmamos al crear tu cuenta.',
};
