import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

function toggle() {
  return screen.getByRole('button', { name: /abrir menú|cerrar menú/i });
}

function menu() {
  return document.getElementById('mobile-menu')!;
}

describe('menú móvil', () => {
  it('abre y cierra con el botón; aria-expanded y hidden acompañan', () => {
    render(<App path="/es/" />);
    const button = toggle();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('mobile-menu');
    expect(menu().hidden).toBe(true);

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Cerrar menú');
    expect(menu().hidden).toBe(false);
    // El foco entra al primer link del menú y el resto de la página queda inerte.
    expect(document.activeElement).toBe(within(menu()).getAllByRole('link')[0]);
    expect(document.getElementById('main')!.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.footer')!.hasAttribute('inert')).toBe(true);
    // Logo, selector de idioma y CTA del header tampoco son alcanzables (ni en modo virtual).
    for (const selector of ['.brand', '.header__lang', '.header__cta']) {
      expect(document.querySelector(selector)!.hasAttribute('inert')).toBe(true);
    }

    fireEvent.click(button);
    expect(menu().hidden).toBe(true);
    expect(document.getElementById('main')!.hasAttribute('inert')).toBe(false);
  });

  it('Esc cierra y devuelve el foco al botón', () => {
    render(<App path="/es/" />);
    fireEvent.click(toggle());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it('el foco queda atrapado entre el botón y el menú (Tab y Shift+Tab)', () => {
    render(<App path="/es/" />);
    fireEvent.click(toggle());
    const focusables = [...menu().querySelectorAll<HTMLElement>('a[href], button')];
    const last = focusables[focusables.length - 1]!;
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(toggle());
    fireEvent.keyDown(toggle(), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('elegir un link cierra el menú', () => {
    render(<App path="/es/" />);
    fireEvent.click(toggle());
    fireEvent.click(within(menu()).getByRole('link', { name: /servicios/i }));
    expect(menu().hidden).toBe(true);
  });

  it('navegación ES/EN con anclas por idioma y CTA de propuesta', () => {
    render(<App path="/" />);
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Services',
      'Solutions',
      'Process',
      'About',
      'Contact',
    ]);
    expect(links[0]!.getAttribute('href')).toBe('/#services');
    expect(
      screen.getAllByRole('link', { name: 'Request a proposal' })[0]!.getAttribute('href'),
    ).toBe('/#contact');
  });

  it('selector de idioma: misma página en el otro idioma, con hreflang', () => {
    render(<App path="/es/politica-de-privacidad" />);
    const lang = screen.getAllByRole('link', { name: 'English version' })[0]!;
    expect(lang.getAttribute('href')).toBe('/privacy');
    expect(lang.getAttribute('hreflang')).toBe('en');
    expect(lang.textContent).toContain('EN');
  });
});
