import { ProductCard, ProductCardSkeleton } from '../../components/cards/ProductCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Button } from '../../components/ui/Button';
import { BackHeader } from '../../components/navigation/AppHeader';
import { useAppState } from '../appStateContext';
import { t } from '../../i18n';
import { useMenu } from '../menu/useMenu';
import { ScreenShell } from './ScreenShell';
import { RetryState } from './ScreenStates';
import './screens.css';

export interface FavouritesScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  onOpenMenu?: () => void;
}

/**
 * Saved products, as a list of horizontal cards so more fit per screen. The
 * ids are real menu item ids kept on the device; a saved dish that left the
 * menu simply stops showing.
 */
export const FavouritesScreen = ({
  embedded = false,
  onBack,
  onOpenMenu,
}: FavouritesScreenProps) => {
  const { favourites, toggleFavourite, addLine } = useAppState();
  const { menu, loading, error, retry } = useMenu();
  const saved = (menu?.products ?? []).filter((product) => favourites.includes(product.id));

  return (
    <ScreenShell
      header={<BackHeader title={t('favourites.title')} onBack={onBack} flush={embedded} />}
    >
      <div className="vt-screen__inner">
        {error ? (
          <RetryState title={t('menu.loadError')} message={error} onRetry={retry} />
        ) : loading ? (
          <div className="vt-stack-3" aria-busy="true">
            {[0, 1].map((index) => (
              <ProductCardSkeleton key={index} variant="horizontal" />
            ))}
          </div>
        ) : saved.length === 0 ? (
          <EmptyState
            icon="heartOutline"
            title={t('favourites.emptyTitle')}
            description={t('favourites.emptyDescription')}
            action={
              <Button variant="primary" onClick={onOpenMenu}>
                {t('common.seeMenu')}
              </Button>
            }
          />
        ) : (
          <div className="vt-stack-3">
            {saved.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                variant="horizontal"
                index={index}
                onAdd={addLine}
                favourite
                onToggleFavourite={toggleFavourite}
              />
            ))}
          </div>
        )}
      </div>
    </ScreenShell>
  );
};
