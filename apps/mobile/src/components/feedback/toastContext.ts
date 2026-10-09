import { createContext, useContext } from 'react';
import type { AlertTone } from './InlineAlert';

export interface ToastRequest {
  message: string;
  tone?: AlertTone;
  /** Milliseconds; defaults to 2600. */
  duration?: number;
}

export interface ToastContextValue {
  showToast: (request: ToastRequest) => void;
}

/** Kept apart from the provider component so the module stays hot-reloadable. */
export const ToastContext = createContext<ToastContextValue | null>(null);

/** Throws outside the provider — a silently swallowed toast is worse. */
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};
