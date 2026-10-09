import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { PROJECTS } from '@/content';
import { dict, type Anchors } from '@/i18n';
import { sectionHref } from '@/links';
import { PATHS, type Route } from '@/routes';
import { cssVars } from '@/style';

import { Logo } from './Brand';
import { LanguageSwitch } from './LanguageSwitch';

const FOCUSABLE = 'a[href], button:not([disabled])';
/** Debajo de este ancho la navegación va en el menú desplegable (igual que el CSS). */
const DESKTOP_QUERY = '(min-width: 1080px)';

export function navItems(route: Route): { key: keyof Anchors; href: string; label: string }[] {
  const t = dict(route.locale);
  const keys: (keyof Anchors)[] = ['services', 'solutions', 'process', 'about'];
  // «Proyectos» solo existe si hay casos publicados.
  if (PROJECTS.length > 0) keys.push('projects');
  keys.push('contact');
  return keys.map((key) => ({ key, href: sectionHref(route.locale, key), label: t.nav[key] }));
}

/**
 * Header sticky: transparente sobre el hero navy de la home y sólido al hacer scroll (un
 * IntersectionObserver sobre un centinela, sin listener de scroll). Menú móvil accesible: foco
 * atrapado, Esc, cierre al navegar y el resto de la página `inert` mientras está abierto.
 */
export function Header({ route }: { route: Route }) {
  const t = dict(route.locale);
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = navItems(route);
  const home = PATHS.home[route.locale];
  const tone = route.page === 'home' ? 'dark' : 'light';

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // Estado «con scroll»: atributo directo en el DOM (no re-renderiza React en cada cruce).
  useEffect(() => {
    const header = headerRef.current;
    const sentinel = sentinelRef.current;
    if (!header || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      header.toggleAttribute('data-scrolled', !entry!.isIntersecting);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Con el menú abierto: el resto de la página inerte, sin scroll de fondo, foco al primer link.
  useEffect(() => {
    if (!open) return;
    const outside = [document.getElementById('main'), document.querySelector('.footer')];
    for (const element of outside) element?.setAttribute('inert', '');
    document.documentElement.classList.add('menu-open');
    menuRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const desktop = window.matchMedia?.(DESKTOP_QUERY);
    const onChange = () => desktop?.matches && setOpen(false);
    desktop?.addEventListener?.('change', onChange);
    return () => {
      for (const element of outside) element?.removeAttribute('inert');
      document.documentElement.classList.remove('menu-open');
      desktop?.removeEventListener?.('change', onChange);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const menu = menuRef.current;
    const toggle = toggleRef.current;
    if (!menu || !toggle) return;
    const focusables = [toggle, ...menu.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true" />
      <header
        ref={headerRef}
        className="header"
        data-tone={tone}
        data-open={open ? '' : undefined}
        onKeyDown={onKeyDown}
      >
        <a className="skip-link" href="#main">
          {t.a11y.skip}
        </a>
        <div className="container header__inner">
          <a className="brand" href={home} aria-label={t.a11y.home}>
            <Logo variant="white" className="brand__logo brand__logo--white" />
            <Logo variant="color" className="brand__logo brand__logo--color" />
          </a>
          <nav className="nav" aria-label={t.a11y.mainNav}>
            <ul>
              {items.map((item) => (
                <li key={item.key}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="header__actions">
            <LanguageSwitch route={route} className="header__lang" />
            <a
              className="btn btn--primary btn--sm header__cta"
              href={sectionHref(route.locale, 'contact')}
            >
              {t.nav.cta}
            </a>
            <button
              ref={toggleRef}
              type="button"
              className="menu-toggle"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t.a11y.closeMenu : t.a11y.openMenu}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="menu-toggle__bars" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          ref={menuRef}
          id="mobile-menu"
          className="mobile-menu"
          hidden={!open}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) close(false);
          }}
        >
          <nav className="container mobile-menu__inner" aria-label={t.a11y.mainNav}>
            <ol className="mobile-menu__list">
              {items.map((item, index) => (
                <li key={item.key} style={cssVars({ '--i': index })}>
                  <a href={item.href}>
                    <span className="mobile-menu__num" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
            <div className="mobile-menu__foot">
              <a className="btn btn--primary" href={sectionHref(route.locale, 'contact')}>
                {t.nav.cta}
              </a>
              <LanguageSwitch route={route} className="mobile-menu__lang" />
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
