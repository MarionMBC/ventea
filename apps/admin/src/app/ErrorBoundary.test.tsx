import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
});
