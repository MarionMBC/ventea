import { brandStore } from '../../brand/brandStore';
import { formatMoney } from '../../i18n';

/**
 * Single money formatter for the whole app. Prices are never formatted inline:
 * one place decides the locale (app language), the currency (the brand's,
 * from `/api/tenant`) and the decimals (the currency's own: CLP has none).
 */
export const formatPrice = (value: number): string => formatMoney(value, brandStore.get().currency);
