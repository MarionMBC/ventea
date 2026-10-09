import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { en } from '@/i18n/en';
import { es } from '@/i18n/es';

import { Services } from './Services';

function mockWide(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: wide && query.includes('min-width: 900px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const buttons = () =>
  screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-controls'));

describe('Servicios (maestro-detalle / acordeón)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cinco servicios numerados; el primero abierto y el resto ocultos', () => {
    render(<Services t={es} />);
    const all = buttons();
    expect(all).toHaveLength(5);
    expect(all.map((b) => b.textContent)).toEqual([
      '01Software a medida',
      '02Aplicaciones web y móviles',
      '03Inteligencia artificial y automatización',
      '04Arquitectura e integraciones',
      '05Productos y plataformas SaaS',
    ]);
    expect(all.map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    const panel = document.getElementById(all[0]!.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe(all[0]!.id);
    expect(panel.hidden).toBe(false);
    expect(document.getElementById(all[1]!.getAttribute('aria-controls')!)!.hidden).toBe(true);
    // Los botones están dentro de encabezados h3 (patrón acordeón).
    expect(all[0]!.parentElement!.tagName).toBe('H3');
  });

  it('teclado: flechas, Inicio y Fin mueven el foco; Enter/clic abre el panel', () => {
    render(<Services t={es} />);
    const all = buttons();
    all[0]!.focus();
    fireEvent.keyDown(all[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(all[1]);
    fireEvent.keyDown(all[1]!, { key: 'End' });
    expect(document.activeElement).toBe(all[4]);
    fireEvent.keyDown(all[4]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(all[0]);
    fireEvent.keyDown(all[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(all[4]);
    fireEvent.keyDown(all[4]!, { key: 'Home' });
    expect(document.activeElement).toBe(all[0]);

    // Un <button> nativo convierte Enter/Espacio en clic.
    fireEvent.click(all[3]!);
    expect(all[3]!.getAttribute('aria-expanded')).toBe('true');
    expect(all[0]!.getAttribute('aria-expanded')).toBe('false');
    const panel = document.getElementById(all[3]!.getAttribute('aria-controls')!)!;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Arquitectura de software, no de construcción');
  });

  it('móvil (acordeón): tocar el abierto lo cierra', () => {
    mockWide(false);
    render(<Services t={es} />);
    const first = buttons()[0]!;
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
  });

  it('escritorio (maestro-detalle): siempre queda un panel abierto', () => {
    mockWide(true);
    render(<Services t={es} />);
    const first = buttons()[0]!;
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
  });

  it('el CTA del servicio lleva al contacto de su idioma', () => {
    render(<Services t={en} />);
    const cta = screen.getByRole('link', { name: /let’s talk about your system/i });
    expect(cta.getAttribute('href')).toBe('/en/#contact');
  });
});
