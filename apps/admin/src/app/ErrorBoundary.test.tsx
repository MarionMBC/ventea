import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/i18n';

import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('dato inesperado');
}

describe('ErrorBoundary', () => {
  it('un error de render muestra el aviso con «Reload» en vez de pantalla en blanco', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Something went wrong in the dashboard',
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    consoleError.mockRestore();
  });

  it('en español (p. ej. la plataforma) el aviso sale en español', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <I18nProvider lang="es">
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>
      </I18nProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal en el panel');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeTruthy();
    consoleError.mockRestore();
  });
});
