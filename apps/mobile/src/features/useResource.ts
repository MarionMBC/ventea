import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, networkErrorMessage } from '../api/client';

export interface Resource<T> {
  data: T | undefined;
  /** Message ready to show; set when the last load failed. */
  error: string | undefined;
  /** True only while there is nothing to show yet (first load, retry after an error). */
  loading: boolean;
  /** Loads again; keeps showing the current data meanwhile. */
  reload: () => void;
}

export const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : networkErrorMessage();

interface Result<T> {
  /** Which deps the result belongs to: a result for other deps is not shown. */
  key: string;
  data?: T;
  error?: string;
}

/**
 * Loads one API resource for a screen: loading, error with retry, data.
 *
 * Deliberately tiny instead of a data-fetching library: the app has a handful
 * of reads and none of them need a cache shared across screens except the
 * menu, which has its own. `enabled: false` skips the request (a screen shown
 * signed out), and `pollMs` reloads in the background — the tracking screen
 * uses it, and turns it off once the order is final or the page is not in
 * view. Ticks are skipped while the document is hidden.
 *
 * State only changes in callbacks (a response, a retry, a tick), never
 * synchronously inside an effect; `loading` is derived. `deps` must be
 * JSON-serialisable (ids, flags).
 */
export const useResource = <T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  { enabled = true, pollMs }: { enabled?: boolean; pollMs?: number } = {},
): Resource<T> => {
  const depsKey = JSON.stringify(deps);
  const [result, setResult] = useState<Result<T>>({ key: depsKey });
  const [attempt, setAttempt] = useState(0);
  /* The loader is usually an inline arrow; reading it through a ref keeps it
     out of the effect's dependencies so it does not refetch on every render.
     Declared before the loading effect, so it is current when that one runs. */
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key: depsKey, data });
      },
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        /* A failed refresh keeps the last data for the same deps on screen. */
        setResult((current) => ({
          key: depsKey,
          data: current.key === depsKey ? current.data : undefined,
          error: errorMessage(reason),
        }));
      },
    );
    return () => controller.abort();
  }, [enabled, attempt, depsKey]);

  useEffect(() => {
    if (!enabled || !pollMs) return undefined;
    /* A backgrounded app or tab has no one to show news to: skip the tick. */
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setAttempt((count) => count + 1);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs]);

  const reload = useCallback(() => {
    setResult((current) => ({ ...current, error: undefined }));
    setAttempt((count) => count + 1);
  }, []);

  const current: Result<T> = result.key === depsKey ? result : { key: depsKey };
  return {
    data: current.data,
    error: current.error,
    loading: enabled && current.data === undefined && current.error === undefined,
    reload,
  };
};
