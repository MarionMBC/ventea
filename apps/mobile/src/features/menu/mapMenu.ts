import type { MenuCategory, MenuItem, ModifierGroup, PublicMenu } from '../../api/types';
import { resolveMediaUrl } from '../../brand/media';
import { API_URL } from '../../brand/runtime';
import type {
  Category,
  CategoryAccent,
  Product,
  ProductOptionGroup,
  ProductTag,
} from '../../types/product';

/**
 * API → view model. The screens and cards were designed against `Product`
 * and `Category`; mapping at the edge keeps every component simple and makes
 * the translation rules testable in one pure module.
 *
 * Nothing here knows a particular brand: categories keep their API id and
 * name, every modifier group is drawn the same way, and photos come only from
 * `imageUrl`.
 */

/** Lower case, accents stripped, letters and digits only. */
export const normaliseName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Icon for a category, guessed from its name in English or Spanish. Purely
 * decorative (the name is always shown): no match gives the generic plate.
 */
const iconKeywords: [icon: string, words: string[]][] = [
  [
    'fastFood',
    ['burger', 'hamburguesa', 'sandwich', 'sanguche', 'wrap', 'taco', 'hot dog', 'completo'],
  ],
  ['pizza', ['pizza']],
  [
    'beer',
    [
      'drink',
      'beverage',
      'bebida',
      'soda',
      'juice',
      'jugo',
      'tea',
      'te ',
      'coffee',
      'cafe',
      'shake',
      'beer',
      'cerveza',
    ],
  ],
  ['iceCream', ['dessert', 'postre', 'ice cream', 'helado', 'sweet', 'dulce']],
  ['priceTags', ['combo', 'box', 'meal', 'menu del dia', 'bundle', 'promo']],
  ['water', ['sauce', 'salsa', 'dip', 'aderezo']],
  ['leaf', ['salad', 'ensalada', 'veggie', 'vegan', 'vegano']],
  ['nutrition', ['side', 'acompanamiento', 'fries', 'papas', 'snack', 'extra']],
  ['flame', ['chicken', 'pollo', 'wing', 'ala', 'tender', 'grill', 'parrilla']],
];

export const categoryIcon = (name: string): string => {
  const normalised = ` ${normaliseName(name)} `;
  return (
    iconKeywords.find(([, words]) => words.some((word) => normalised.includes(word)))?.[0] ??
    'restaurant'
  );
};

const ACCENTS: CategoryAccent[] = ['brand', 'accent', 'neutral'];

export const mapOptionGroup = (group: ModifierGroup): ProductOptionGroup => ({
  id: group.id,
  name: group.name,
  kind: group.maxSelect === 1 ? 'single' : 'multi',
  minSelect: group.minSelect,
  maxSelect: group.maxSelect,
  options: group.options.map((option) => ({
    id: option.id,
    name: option.name,
    priceDeltaCents: option.priceDeltaCents,
    soldOut: !option.isAvailable || undefined,
  })),
});

const knownTags: ProductTag[] = ['popular', 'new', 'hot', 'combo'];

const centsToPrice = (cents: number) => cents / 100;

export const mapMenuItem = (item: MenuItem, apiUrl: string = API_URL): Product => {
  const optionGroups = item.modifierGroups.map(mapOptionGroup);
  const tags = item.tags.filter((tag): tag is ProductTag => knownTags.includes(tag as ProductTag));
  const description = item.description ?? '';
  const price = centsToPrice(item.basePriceCents);
  const previousPrice =
    item.compareAtPriceCents !== null && item.compareAtPriceCents > item.basePriceCents
      ? centsToPrice(item.compareAtPriceCents)
      : undefined;

  return {
    id: item.id,
    name: item.name,
    /* The API has a single description; cards clamp it to two lines. */
    shortDescription: description,
    description,
    categoryId: item.categoryId,
    price,
    previousPrice,
    imageUrl: resolveMediaUrl(item.imageUrl, apiUrl),
    tags,
    soldOut: !item.isAvailable || undefined,
    combo: tags.includes('combo')
      ? {
          /* "3 tenders + fries + drink" → the bundled pieces. */
          includes: description.includes('+')
            ? description
                .split('+')
                .map((part) => part.trim())
                .filter(Boolean)
            : [],
          savings: previousPrice !== undefined ? previousPrice - price : 0,
        }
      : undefined,
    optionGroups,
  };
};

export interface MenuViewModel {
  locationId: string;
  currency: string;
  categories: Category[];
  /** Every product, in menu order (category order, then item order). */
  products: Product[];
}

export const mapMenu = (menu: PublicMenu, apiUrl: string = API_URL): MenuViewModel => {
  const sorted: MenuCategory[] = [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const categories: Category[] = [];
  const products: Product[] = [];

  sorted.forEach((category, index) => {
    const items = [...category.items].sort((a, b) => a.sortOrder - b.sortOrder);
    /* An empty section is a dead end in the rail and the filter. */
    if (items.length === 0) return;
    categories.push({
      id: category.id,
      name: category.name,
      icon: categoryIcon(category.name),
      accent: ACCENTS[index % ACCENTS.length] as CategoryAccent,
      itemCount: items.length,
    });
    products.push(
      ...items.map((item) => mapMenuItem({ ...item, categoryId: category.id }, apiUrl)),
    );
  });

  return { locationId: menu.locationId, currency: menu.currency, categories, products };
};
