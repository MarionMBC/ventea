import { useEffect, useState } from 'react';

import { Brand } from '@/landing/Brand';

const LINKS = [
  { href: '#experiencia', label: 'Producto' },
  { href: '#puntos', label: 'Puntos' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#precios', label: 'Precios' },
  { href: '#preguntas', label: 'Preguntas' },
];

/**
 * Barra fija de la landing. Al bajar del hero pasa de transparente sobre marino a clara. En
 * móvil, menú desplegable (botón con aria-expanded; Escape lo cierra) y el CTA siempre visible.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const light = scrolled || open;

  return (
    <header
      className={`topbar topbar--landing${light ? ' is-light' : ''}${open ? ' is-open' : ''}`}
    >
      <div className="container topbar__inner">
        <Brand tone={light ? 'light' : 'dark'} />
        <nav className="topbar__nav" id="menu-principal" aria-label="Secciones">
          <ul>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </a>
              </li>
            ))}
            <li className="topbar__login">
              <a href="#acceso" onClick={() => setOpen(false)}>
                Iniciar sesión
              </a>
            </li>
          </ul>
        </nav>
        <div className="topbar__end">
          <a className="topbar__signin" href="#acceso">
            Iniciar sesión
          </a>
          <a className="btn btn--sun btn--sm" href="/registro">
            Registrarme
          </a>
          <button
            type="button"
            className="topbar__toggle"
            aria-expanded={open}
            aria-controls="menu-principal"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            <span className="topbar__burger" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
