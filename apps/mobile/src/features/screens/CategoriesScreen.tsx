import { CategoryCard } from '../../components/cards/CategoryCard';
import { Breadcrumb } from '../../components/navigation/Breadcrumb';
import { BackHeader } from '../../components/navigation/AppHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { t } from '../../i18n';
import { useMenu } from '../menu/useMenu';
import { ScreenShell } from './ScreenShell';
import { RetryState } from './ScreenStates';
import './screens.css';

export interface CategoriesScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  onSelect?: (categoryId: string) => void;
}

/**
 * Full category index, from the API menu. The grid is two columns on a phone
 * and fluid above.
 */
export const CategoriesScreen = ({ embedded = false, onBack, onSelect }: CategoriesScreenProps) => {
  const { menu, loading, error, retry } = useMenu();

  return (
    <ScreenShell
      header={<BackHeader title={t('home.categories')} onBack={onBack} flush={embedded} />}
    >
      <div className="vt-screen__inner">
        <Breadcrumb
          items={[{ label: t('tab.home'), href: '/home' }, { label: t('home.categories') }]}
        />
        {error ? (
          <RetryState title={t('menu.loadError')} message={error} onRetry={retry} />
        ) : loading ? (
          <div
            className="vt-grid-2"
            role="status"
            aria-busy="true"
            aria-label={t('a11y.loadingCategories')}
          >
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} height="112px" radius="md" />
            ))}
          </div>
        ) : (
          <div className="vt-grid-2">
            {(menu?.categories ?? []).map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onSelect={onSelect ? (item) => onSelect(item.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </ScreenShell>
  );
};
