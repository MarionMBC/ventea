import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastContext } from '../components/feedback/toastContext';
import type { Product } from '../types/product';
import { AppStateContext } from './appStateContext';
import type { AppStateValue } from './appStateContext';
import { useAddToCart } from './useAddToCart';

const combo = { id: 'p1', name: 'Carolina 4' } as Product;

const setup = () => {
  const addLine = vi.fn();
  const showToast = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStateContext.Provider value={{ addLine } as unknown as AppStateValue}>
      <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
    </AppStateContext.Provider>
  );
  const { result } = renderHook(() => useAddToCart(), { wrapper });
  return { add: result.current, addLine, showToast };
};

describe('useAddToCart', () => {
  it('adds the line and confirms it with a success toast', () => {
    const { add, addLine, showToast } = setup();
    add(combo);
    expect(addLine).toHaveBeenCalledWith(combo);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'success', message: expect.stringContaining('Carolina 4') }),
    );
  });

  it('does nothing for a sold-out product', () => {
    const { add, addLine, showToast } = setup();
    add({ ...combo, soldOut: true });
    expect(addLine).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
