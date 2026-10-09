import { useMemo, useState } from 'react';
import { ComboCard } from '../../components/cards/ComboCard';
import { ProductCard, ProductCardSkeleton } from '../../components/cards/ProductCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { SearchField } from '../../components/forms/SearchField';
import { Button } from '../../components/ui/Button';
import { CartButton } from '../../components/navigation/CartButton';
import { CategoryTabs } from '../../components/navigation/CategoryTabs';
import { SearchHeader } from '../../components/navigation/AppHeader';
import { t } from '../../i18n';
import { useAppState } from '../appStateContext';
import { useMenu } from '../menu/useMenu';
import { ScreenShell } from './ScreenShell';
import { RetryState } from './ScreenStates';
import './screens.css';

export interface MenuScreenProps {
  embedded?: boolean;
  /** Renders the skeleton grid instead of the results. */
  loading?: boolean;
  onOpenCart?: () => void;
  onSelectProduct?: (productId: string) => void;
}

const ALL = 'all';

/**
 * Menu browser: search, category filter, grid of products — all from the API
 * menu. While it loads the grid shows skeletons; a failure shows a retry.
 */
export const MenuScreen = ({
  embedded = false,
  loading: forcedLoading = false,
  onOpenCart,
  onSelectProduct,
}: MenuScreenProps) => {
  const { cartCount, addLine, favourites, toggleFavourite } = useAppState();
  const { menu, loading: menuLoading, error, retry } = useMenu();
  const loading = forcedLoading || menuLoading;
  const categories = menu?.categories ?? [];
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (menu?.products ?? []).filter((product) => {
      const matchesCategory = category === ALL || product.categoryId === category;
      const matchesQuery =
        normalized.length === 0 ||
        product.name.toLowerCase().includes(normalized) ||
        product.shortDescription.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [menu, category, query]);

  const combos = results.filter((product) => product.combo);
  const singles = results.filter((product) => !product.combo);

  return (
    <ScreenShell
      header={
        <SearchHeader
          flush={embedded}
          actions={<CartButton count={cartCount} onClick={onOpenCart} />}
        >
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder={t('menu.searchPlaceholder')}
          />
        </SearchHeader>
      }
    >
      <div className="vt-screen__inner">
        <CategoryTabs
          value={category}
          onChange={setCategory}
          items={[
            { id: ALL, label: t('menu.all') },
            ...categories.map((item) => ({ id: item.id, label: item.name })),
          ]}
        />

        {error && !forcedLoading ? (
          <RetryState title={t('menu.loadError')} message={error} onRetry={retry} />
        ) : loading ? (
          <div className="vt-grid-2">
            {[0, 1, 2, 3].map((index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon="searchOutline"
            title={t('menu.noResults')}
            description={t('menu.noResultsDescription')}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setCategory(ALL);
                }}
              >
                {t('menu.clearFilters')}
              </Button>
            }
          />
        ) : (
          <>
            {combos.map((product) => (
              <ComboCard
                key={product.id}
                product={product}
                onAdd={addLine}
                onSelect={onSelectProduct ? (item) => onSelectProduct(item.id) : undefined}
              />
            ))}
            <div className="vt-grid-2">
              {singles.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                  onAdd={addLine}
                  onSelect={onSelectProduct ? (item) => onSelectProduct(item.id) : undefined}
                  favourite={favourites.includes(product.id)}
                  onToggleFavourite={toggleFavourite}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </ScreenShell>
  );
};
