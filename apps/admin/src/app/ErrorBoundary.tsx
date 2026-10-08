import { Component, type ErrorInfo, type ReactNode } from 'react';

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
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash">
        <div className="state state--error" role="alert">
          <h1>Algo salió mal en el panel</h1>
          <p>Recarga la página para seguir. Tus pedidos no se pierden.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      </main>
    );
  }
}
