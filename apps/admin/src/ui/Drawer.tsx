import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { useT } from '@/i18n';

import { IconClose } from './icons';
import { useScrollLock } from './scrollLock';

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Panel lateral modal (editor de ítem, de grupo). A la derecha en escritorio, a pantalla
 * completa en el teléfono. Lleva el foco adentro, lo atrapa, cierra con Escape (salvo mientras
 * guarda) y lo devuelve al botón que lo abrió. Se monta dentro de la página (no en un portal)
 * para heredar el color de la marca del shell.
 */
export function Drawer({
  title,
  subtitle,
  children,
  footer,
  busy = false,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Guardando: Escape y el fondo no cierran (el botón de cerrar queda deshabilitado). */
  busy?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  useScrollLock();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const first = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root;
    first?.focus();
    return () => {
      // El que abrió puede haber desaparecido (p. ej. un ítem recién borrado).
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) onClose();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panel.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="drawer">
      <div className="drawer__scrim" aria-hidden="true" onClick={() => !busy && onClose()} />
      <section
        ref={panel}
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="drawer__head">
          <div className="drawer__titles">
            <h2 id={titleId} className="drawer__title">
              {title}
            </h2>
            {subtitle && <p className="drawer__sub">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('common.close')}
            onClick={onClose}
            disabled={busy}
          >
            <IconClose size={22} />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </section>
    </div>
  );
}
