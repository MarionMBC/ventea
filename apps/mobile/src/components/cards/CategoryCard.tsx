import { IonIcon } from '@ionic/react';
import type { Category } from '../../types/product';
import { resolveIcon } from '../ui/icons';
import { t } from '../../i18n';
import './cards.css';

export interface CategoryCardProps {
  category: Category;
  onSelect?: (category: Category) => void;
  selected?: boolean;
  /** `grid` fills a two-column grid; `rail` is the narrow home scroller card. */
  variant?: 'grid' | 'rail';
  /** Hide the item count when the number would be noise. */
  showCount?: boolean;
}

/** Entry point to a menu section. Icon-led, because category photography at
 *  this size competes with the product cards right below it. */
export const CategoryCard = ({
  category,
  onSelect,
  selected = false,
  variant = 'grid',
  showCount = true,
}: CategoryCardProps) => (
  <button
    type="button"
    aria-pressed={onSelect ? selected : undefined}
    onClick={onSelect ? () => onSelect(category) : undefined}
    className={[
      'vt-card',
      'vt-category',
      'vt-pressable',
      variant === 'rail' ? 'vt-category--rail' : '',
      selected ? 'vt-card--selected vt-category--selected' : '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <span className={`vt-category__icon vt-category__icon--${category.accent}`}>
      <IonIcon aria-hidden="true" icon={resolveIcon(category.icon)} />
    </span>
    <span className="vt-stack-1">
      <span className="vt-category__name">{category.name}</span>
      {showCount && variant === 'grid' && (
        <span className="vt-category__count">
          {t(category.itemCount === 1 ? 'category.countOne' : 'category.countOther', {
            count: category.itemCount,
          })}
        </span>
      )}
    </span>
  </button>
);
