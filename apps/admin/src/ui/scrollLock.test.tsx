import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { lockScroll, useScrollLock } from './scrollLock';

const root = () => document.documentElement.style;

function Locked() {
  useScrollLock();
  return null;
}

afterEach(() => {
  root().overflow = '';
});

describe('lockScroll', () => {
  it('bloquea el documento y lo libera devolviendo el valor anterior', () => {
    root().overflow = 'clip';
    const release = lockScroll();
    expect(root().overflow).toBe('hidden');
    release();
    expect(root().overflow).toBe('clip');
  });

  it('cuenta los bloqueos: un diálogo encima de un panel no libera el fondo al cerrarse', () => {
    const drawer = lockScroll();
    const confirm = lockScroll();
    confirm();
    expect(root().overflow).toBe('hidden');
    drawer();
    expect(root().overflow).toBe('');
  });

  it('liberar dos veces no descuenta el bloqueo de otro', () => {
    const drawer = lockScroll();
    const confirm = lockScroll();
    confirm();
    confirm();
    expect(root().overflow).toBe('hidden');
    drawer();
    expect(root().overflow).toBe('');
  });

  it('useScrollLock bloquea mientras el componente está montado', () => {
    const { unmount } = render(<Locked />);
    expect(root().overflow).toBe('hidden');
    unmount();
    expect(root().overflow).toBe('');
  });
});
