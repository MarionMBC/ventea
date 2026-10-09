import { Component, type ErrorInfo, type ReactNode } from 'react';

import { useT } from '@/i18n';
import { IconAlert } from '@/ui/icons';

interface State {
  failed: boolean;
}

/**
 * Último recurso: un error de render (dato inesperado de la API, bug) no deja el
 * mostrador con la pantalla en blanco, sino con un botón para recargar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error en el panel', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}

function CrashScreen() {
  const t = useT();
  return (
    <main className="crash">
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('crash.title')}</h1>
        <p>{t('crash.body')}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          {t('crash.reload')}
        </button>
      </div>
    </main>
  );
}
