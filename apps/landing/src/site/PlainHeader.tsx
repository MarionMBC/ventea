import { Brand } from '@/landing/Brand';

/** Barra simple (registro y páginas legales): marca y volver al inicio. */
export function PlainHeader() {
  return (
    <header className="topbar topbar--plain">
      <div className="container topbar__inner">
        <Brand />
        <a className="topbar__back" href="/">
          Volver al inicio
        </a>
      </div>
    </header>
  );
}
