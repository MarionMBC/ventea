import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Pull distance (px) that triggers a refresh, and the most the indicator follows the finger. */
export const PULL_THRESHOLD = 64;
const PULL_MAX = 96;
/** A refresh shows at least this long, so a fast response still reads as "done". */
const MIN_SPIN_MS = 600;

export interface PullToRefresh {
  /** Indicator offset in px (0 when idle). */
  pull: number;
  refreshing: boolean;
}

/**
 * Pull-down-to-reload on a scroll container the app owns (`ScreenShell` is not an
 * `IonContent`, so `IonRefresher` does not apply). Only starts when the container
 * is scrolled to the very top; the finger drag is damped; `onRefresh` runs on
 * release past the threshold. A failed refresh is the caller's to report.
 */
export const usePullToRefresh = (
  ref: RefObject<HTMLElement | null>,
  onRefresh: (() => unknown) | undefined,
): PullToRefresh => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });

  const setPullBoth = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  const enabled = onRefresh !== undefined;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    const onStart = (event: TouchEvent) => {
      startY.current = !busy.current && el.scrollTop <= 0 ? event.touches[0]!.clientY : null;
    };
    const onMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const dy = event.touches[0]!.clientY - startY.current;
      if (dy <= 0 || el.scrollTop > 0) {
        if (pullRef.current !== 0) setPullBoth(0);
        return;
      }
      setPullBoth(Math.min(PULL_MAX, dy * 0.5));
    };
    const onEnd = () => {
      const shouldRefresh = startY.current !== null && pullRef.current >= PULL_THRESHOLD;
      startY.current = null;
      if (!shouldRefresh) {
        setPullBoth(0);
        return;
      }
      busy.current = true;
      setRefreshing(true);
      setPullBoth(PULL_THRESHOLD);
      const started = Date.now();
      let result: unknown;
      try {
        result = refreshRef.current?.();
      } catch {
        /* Reported by the caller. */
      }
      Promise.resolve(result)
        .catch(() => undefined)
        .then(
          () =>
            new Promise((resolve) =>
              window.setTimeout(resolve, Math.max(0, MIN_SPIN_MS - (Date.now() - started))),
            ),
        )
        .then(() => {
          busy.current = false;
          setRefreshing(false);
          setPullBoth(0);
        });
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, enabled, setPullBoth]);

  return { pull, refreshing };
};
