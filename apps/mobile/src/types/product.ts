/** Short marketing flags rendered as badges over the product photography. */
export type ProductTag = 'popular' | 'new' | 'hot' | 'combo';

/** Brand roles a category icon can wear; cycled so neighbours differ. */
export type CategoryAccent = 'brand' | 'accent' | 'neutral';

export interface Category {
  /** API category id. */
  id: string;
  /** Display name, already localized. */
  name: string;
  /** Ionicons name resolved through `src/components/ui/icons.ts`. */
  icon: string;
  /** Accent role used by CategoryCard; keeps colour off the component. */
  accent: CategoryAccent;
  itemCount: number;
}

export interface Product {
  id: string;
  name: string;
  /** One line, never more — cards clamp it to two lines at most. */
  shortDescription: string;
  /** Full copy for the product detail screen. */
  description: string;
  /** API category id; empty for order-line snapshots. */
  categoryId: string;
  /** Current price in currency units (cents / 100). */
  price: number;
  /** Undiscounted price; render only when higher than `price`. */
  previousPrice?: number;
  imageUrl?: string;
  tags: ProductTag[];
  soldOut?: boolean;
  /** Set for combo products; drives ComboCard. */
  combo?: ComboDetails;
  /** Modifier groups from the API (sizes, extras, heat…), all drawn alike. */
  optionGroups?: ProductOptionGroup[];
}

/**
 * How the detail screen draws a modifier group: a radio list (exactly one)
 * or a checkbox list (any number up to `maxSelect`). No group is special —
 * a heat level is just another single-choice group.
 */
export type OptionGroupKind = 'single' | 'multi';

export interface ProductOptionGroup {
  id: string;
  name: string;
  kind: OptionGroupKind;
  minSelect: number;
  maxSelect: number;
  options: ProductOption[];
}

export interface ProductOption {
  /** API option id — what the order sends back as `selectedOptionIds`. */
  id: string;
  name: string;
  /** Integer cents, exactly as the API prices it. */
  priceDeltaCents: number;
  soldOut?: boolean;
}

export interface ComboDetails {
  /** Human readable size, e.g. "3 pzas"; the API has no such field. */
  size?: string;
  /** Names of the items bundled in the combo. */
  includes: string[];
  /** Money saved against buying the items separately. */
  savings: number;
}

/** An optional extra the guest can add while customizing an order line. */
export interface ProductExtra {
  id: string;
  name: string;
  price: number;
  soldOut?: boolean;
}
