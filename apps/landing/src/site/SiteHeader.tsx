import { useEffect, useState } from 'react';

import { signupHref, useLocale, useT } from '@/i18n';
import { Brand } from '@/landing/Brand';

import { LanguageSwitch } from './LanguageSwitch';

const LINKS = [
  { href: '#experiencia', key: 'product' },
  { href: '#puntos', key: 'points' },
  { href: '#como-funciona', key: 'how' },
  { href: '#precios', key: 'pricing' },
  { href: '#preguntas', key: 'faq' },
] as const;

/**
 * Barra fija de la landing. Al bajar del hero pasa de transparente sobre marino a clara. En
 * móvil, menú desplegable (botón con aria-expanded; Escape lo cierra) y el CTA siempre visible.
 * El cambio de idioma va en la barra en escritorio y dentro del menú en móvil (en 390 px no
 * entra junto al CTA).
 */
export function SiteHeader() {
  const t = useT();
  const locale = useLocale();
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
        <nav className="topbar__nav" id="menu-principal" aria-label={t.header.sectionsLabel}>
          <ul>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setOpen(false)}>
                  {t.header.links[link.key]}
                </a>
              </li>
            ))}
            <li className="topbar__login">
              <a href="#acceso" onClick={() => setOpen(false)}>
                {t.header.signIn}
              </a>
            </li>
            <li className="topbar__lang-item">
              <LanguageSwitch full />
            </li>
          </ul>
        </nav>
        <div className="topbar__end">
          <LanguageSwitch className="topbar__lang" />
          <a className="topbar__signin" href="#acceso">
            {t.header.signIn}
          </a>
          <a className="btn btn--sun btn--sm" href={signupHref(locale)}>
            {t.header.signUp}
          </a>
          <button
            type="button"
            className="topbar__toggle"
            aria-expanded={open}
            aria-controls="menu-principal"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="sr-only">{open ? t.header.closeMenu : t.header.openMenu}</span>
            <span className="topbar__burger" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
