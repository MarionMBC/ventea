import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('dato inesperado');
}

describe('ErrorBoundary', () => {
  it('un error de render muestra el aviso con «Recargar» en vez de pantalla en blanco', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal en el panel');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeTruthy();
    consoleError.mockRestore();
  });
});
