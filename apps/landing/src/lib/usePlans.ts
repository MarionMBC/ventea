import type { Plan } from '@ventea/shared';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, fetchPlans } from './api';

export type PlansState =
  | { status: 'loading' }
  | { status: 'ready'; plans: Plan[] }
  /** `httpStatus`: el de la API (0 = sin respuesta). La vista arma el texto en su idioma. */
  | { status: 'error'; message: string; httpStatus: number };

/** Planes desde `GET /api/platform/plans`: la única fuente de precios de la landing. */
export function usePlans(): PlansState & { retry: () => void } {
  const [state, setState] = useState<PlansState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlans({ signal: controller.signal })
      .then((plans) => setState({ status: 'ready', plans }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'No pudimos cargar los precios.',
          httpStatus: error instanceof ApiError ? error.status : 0,
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}

/** Plan por defecto cuando no llega uno en la URL: el destacado. */
export const FEATURED_PLAN = 'pro';
