import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CONTACT_EMAIL, LEGAL_NAME, TERMS_VERSION } from '@/config';
import { text } from '@/test/fixtures';

import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';

describe('Términos del servicio (TASK-007 AC1)', () => {
  it('un h1, índice con anclas y las secciones que pide la spec', () => {
    render(<TermsPage />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Términos del servicio',
    ]);
    const sections = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent ?? '')
      .join(' | ');
    for (const topic of [
      'Prueba gratis de 14 días',
      'Renovación automática',
      'Cancelación',
      'Falta de pago y suspensión',
      'Tus datos y los de tus clientes',
      'Límites de responsabilidad',
      'Ley aplicable',
    ]) {
      expect(sections).toContain(topic);
    }
    const toc = screen.getByRole('navigation', { name: 'Contenido' });
    const first = within(toc).getAllByRole('link')[0]!;
    expect(document.querySelector(first.getAttribute('href')!)).not.toBeNull();
  });

  it('usa los datos de config: razón social, contacto, Honduras y la versión vigente', () => {
    const { container } = render(<TermsPage />);
    const body = text(container);
    expect(body).toContain(`El servicio lo presta ${LEGAL_NAME}`);
    expect(body).toContain('leyes de la República de Honduras');
    expect(body).toContain(`Versión vigente: ${TERMS_VERSION}`);
    expect(screen.getAllByRole('link', { name: CONTACT_EMAIL })[0]!.getAttribute('href')).toBe(
      `mailto:${CONTACT_EMAIL}`,
    );
    // Sin aviso de borrador visible al público (va en un comentario del código).
    expect(body).not.toMatch(/borrador/i);
  });

  it('el pie enlaza términos y privacidad', () => {
    render(<TermsPage />);
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(
      within(legal)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/terminos', '/privacidad']);
  });
});

describe('Política de privacidad (TASK-007 AC1)', () => {
  it('cubre datos del restaurante y de sus clientes, encargado, retención y derechos', () => {
    const { container } = render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Política de privacidad');
    const body = text(container);
    expect(body).toContain('encargado del tratamiento');
    expect(body).toContain('Datos de los clientes del restaurante');
    expect(body).toContain('Cuánto tiempo los guardamos');
    expect(body).toContain('Tus derechos');
    expect(body).toContain('No usamos cookies de seguimiento');
    expect(document.getElementById('retencion')).not.toBeNull(); // ancla usada desde términos
    expect(body).not.toMatch(/borrador/i);
  });
});
