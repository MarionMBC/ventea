import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

/**
 * Diálogo modal de confirmación. Lleva el foco al primer campo (o al botón de
 * confirmar), lo atrapa adentro, cierra con Escape y lo devuelve al botón que lo abrió.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = root?.querySelector<HTMLElement>('input, select, textarea, [data-confirm]');
    first?.focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const focusable = [
      ...ref.current.querySelectorAll<HTMLElement>(
        'input, select, textarea, button:not(:disabled), a[href]',
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pending) onConfirm();
  };

  return (
    <div className="pf-dialog__backdrop">
      <form
        ref={ref}
        className="pf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onSubmit={onSubmit}
      >
        <h2 id={titleId} className="pf-dialog__title">
          {title}
        </h2>
        {children}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="pf-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </button>
          <button
            type="submit"
            data-confirm
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            disabled={pending}
          >
            {pending ? 'Aplicando…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
