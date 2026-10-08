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

describe('Legales: solo lo que el producto hace hoy (review TASK-007)', () => {
  it.each([
    ['Términos', TermsPage],
    ['Privacidad', PrivacyPage],
  ])('%s no promete correos automáticos, facturas ni borrados por plazo', (_name, Page) => {
    const { container } = render(<Page />);
    const body = text(container).toLowerCase();
    expect(body).not.toMatch(/por correo|te avisamos|envío de correos|notificaciones por correo/);
    expect(body).not.toMatch(/\bfacturas?\b/);
    expect(body).not.toMatch(/\d+\s*días?\s*(por si vuelves|después los borramos)/);
    expect(body).not.toMatch(/90 días|15 días hábiles/);
    // Los avisos viven en el panel.
    expect(body).toContain('panel');
  });

  it('cambios de precio y de términos se anuncian en la página y en el panel con anticipación', () => {
    const { container } = render(<TermsPage />);
    const body = text(container);
    expect(body).toContain(
      'Un cambio de precio se anuncia en esta página y en tu panel con al menos 30 días de anticipación',
    );
    expect(body).toContain('lo anunciamos en esta página y en tu panel con al menos 15 días');
    expect(body).toContain('comprobante de pago');
  });

  it('borrado de datos a pedido por escrito, en un plazo razonable', () => {
    const { container } = render(<PrivacyPage />);
    expect(text(container)).toContain('pídelo por escrito');
    expect(text(container)).toContain('en un plazo razonable');
  });
});
