import { useMemo, useState } from 'react';
import { getLocations } from '../../api/endpoints';
import { useBrand } from '../../brand/useBrand';
import { CategoryCard } from '../../components/cards/CategoryCard';
import { ProductCard, ProductCardSkeleton } from '../../components/cards/ProductCard';
import { SearchField } from '../../components/forms/SearchField';
import { AppHeader } from '../../components/navigation/AppHeader';
import { CartButton } from '../../components/navigation/CartButton';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { t } from '../../i18n';
import { useAppState } from '../appStateContext';
import { useMenu } from '../menu/useMenu';
import { useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';
import { RetryState } from './ScreenStates';
import './screens.css';

export interface HomeScreenProps {
  onOpenCart?: () => void;
  onOpenMenu?: () => void;
  onSelectProduct?: (productId: string) => void;
}

/**
 * Home: the category rail, then the products. Every block comes from the API
 * menu and is shown only when it has real content — "Most ordered" needs
 * items tagged `popular`, "Deals" needs a struck-through
 * `compareAtPriceCents`. There is no editorial banner: the template ships no
 * marketing copy of its own.
 */
export const HomeScreen = ({ onOpenCart, onOpenMenu, onSelectProduct }: HomeScreenProps) => {
  const brand = useBrand();
  const { cartCount, addLine, favourites, toggleFavourite } = useAppState();
  const { menu, loading, error, retry } = useMenu();
  const locations = useResource((signal) => getLocations(signal), []);
  const [query, setQuery] = useState('');

  const products = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const all = menu?.products ?? [];
    return normalized
      ? all.filter((product) => product.name.toLowerCase().includes(normalized))
      : all;
  }, [menu, query]);
  const popular = products.filter((product) => product.tags.includes('popular'));
  const deals = products.filter(
    (product) => product.previousPrice !== undefined && !product.soldOut,
  );
  const select = onSelectProduct
    ? (product: { id: string }) => onSelectProduct(product.id)
    : undefined;

  return (
    <ScreenShell
      header={
        <AppHeader
          placeValue={locations.data?.[0]?.name ?? brand.appName}
          actions={<CartButton count={cartCount} onClick={onOpenCart} />}
        />
      }
    >
      <div className="vt-screen__inner">
        <SearchField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          placeholder={t('menu.searchPlaceholder')}
        />

        {error ? (
          <RetryState title={t('menu.loadError')} message={error} onRetry={retry} />
        ) : loading ? (
          <div className="vt-stack-3" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <ProductCardSkeleton key={index} variant="horizontal" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="vt-body vt-text-secondary">
            {query ? t('menu.noResultsDescription') : t('menu.empty')}
          </p>
        ) : (
          <>
            {!query && (menu?.categories.length ?? 0) > 0 && (
              <section className="vt-section">
                <SectionHeader
                  title={t('home.categories')}
                  actionLabel={t('common.seeAll')}
                  onAction={onOpenMenu}
                />
                <div className="vt-scroller vt-bleed">
                  {(menu?.categories ?? []).map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      variant="rail"
                      onSelect={onOpenMenu ? () => onOpenMenu() : undefined}
                    />
                  ))}
                </div>
              </section>
            )}

            {popular.length > 0 && (
              <section className="vt-section">
                <SectionHeader title={t('home.popular')} />
                <div className="vt-scroller vt-bleed">
                  {popular.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      variant="compact"
                      index={index}
                      onAdd={addLine}
                      onSelect={select}
                    />
                  ))}
                </div>
              </section>
            )}

            {deals.length > 0 && (
              <section className="vt-section">
                <SectionHeader title={t('home.deals')} />
                <div className="vt-scroller vt-bleed">
                  {deals.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      variant="compact"
                      index={index}
                      onAdd={addLine}
                      onSelect={select}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="vt-section">
              <SectionHeader
                title={t('home.fromMenu')}
                actionLabel={t('home.seeMenu')}
                onAction={onOpenMenu}
              />
              <div className="vt-stack-3">
                {products.slice(0, 4).map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    variant="horizontal"
                    index={index}
                    onAdd={addLine}
                    onSelect={select}
                    favourite={favourites.includes(product.id)}
                    onToggleFavourite={toggleFavourite}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </ScreenShell>
  );
};
