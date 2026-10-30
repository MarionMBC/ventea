import { useCallback } from 'react';
import { useToast } from '../components/feedback/toastContext';
import { t } from '../i18n';
import type { Product } from '../types/product';
import { useAppState } from './appStateContext';

/**
 * Add-to-cart for the cards (combos, dishes): adds the line and confirms it with
 * the same toast the product screen uses, so a tap never passes without feedback.
 */
export const useAddToCart = () => {
  const { addLine } = useAppState();
  const { showToast } = useToast();
  return useCallback(
    (product: Product) => {
      if (product.soldOut) return;
      addLine(product);
      showToast({ message: t('product.addedToast', { name: product.name }), tone: 'success' });
    },
    [addLine, showToast],
  );
};
