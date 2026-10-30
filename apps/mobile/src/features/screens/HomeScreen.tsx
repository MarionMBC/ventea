import { useMemo, useState } from 'react';
import { IonActionSheet, IonAlert } from '@ionic/react';
import { useBrand } from '../../brand/useBrand';
import { CategoryCard } from '../../components/cards/CategoryCard';
import { ProductCard, ProductCardSkeleton } from '../../components/cards/ProductCard';
import { SearchField } from '../../components/forms/SearchField';
import { AppHeader } from '../../components/navigation/AppHeader';
import { CartButton } from '../../components/navigation/CartButton';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { t } from '../../i18n';
import { useAppState } from '../appStateContext';
import { useAddToCart } from '../useAddToCart';
import { refreshMenu, useMenu } from '../menu/useMenu';
import { useLocationChoice } from '../locationChoice';
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
  const { cartCount, favourites, toggleFavourite, clearCart } = useAppState();
  const addLine = useAddToCart();
  const { menu, loading, error, retry } = useMenu();
  const choice = useLocationChoice();
  const [picking, setPicking] = useState(false);
  const [switchTo, setSwitchTo] = useState<string | undefined>(undefined);
  const canChoose = choice.locations.length > 1;
  /* Each branch has its own menu: with items in the cart, ask before emptying it. */
  const pickLocation = (id: string) => {
    if (id === choice.current?.id) return;
    if (cartCount > 0) setSwitchTo(id);
    else choice.select(id);
  };
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
      onRefresh={refreshMenu}
      header={
        <AppHeader
          placeValue={choice.current?.name ?? brand.appName}
          onPlaceClick={canChoose ? () => setPicking(true) : undefined}
          placeActionLabel={t('home.chooseLocation')}
          actions={<CartButton count={cartCount} onClick={onOpenCart} />}
        />
      }
    >
      <IonActionSheet
        isOpen={picking}
        header={t('home.chooseLocation')}
        buttons={[
          ...choice.locations.map((item) => ({
            text: item.address ? `${item.name} · ${item.address}` : item.name,
            role: item.id === choice.current?.id ? 'selected' : undefined,
            handler: () => pickLocation(item.id),
          })),
          { text: t('common.cancel'), role: 'cancel' },
        ]}
        onDidDismiss={() => setPicking(false)}
      />
      <IonAlert
        isOpen={switchTo !== undefined}
        header={t('home.changeLocationTitle')}
        message={t('home.changeLocationMessage')}
        buttons={[
          { text: t('common.cancel'), role: 'cancel' },
          {
            text: t('home.changeLocationConfirm'),
            handler: () => {
              clearCart();
              if (switchTo) choice.select(switchTo);
            },
          },
        ]}
        onDidDismiss={() => setSwitchTo(undefined)}
      />
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
