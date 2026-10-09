import { t } from '../../i18n';
import './navigation.css';

export interface CategoryTabItem {
  id: string;
  label: string;
}

export interface CategoryTabsProps {
  items: CategoryTabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the rail. */
  label?: string;
}

/**
 * Horizontally scrolling filter chips. Scroll-snapped and scrollbar-less on
 * touch, still fully reachable by keyboard on the web build.
 */
export const CategoryTabs = ({
  items,
  value,
  onChange,
  label = t('a11y.menuCategories'),
}: CategoryTabsProps) => (
  <div className="vt-scroller" role="tablist" aria-label={label}>
    {items.map((item) => {
      const selected = item.id === value;
      return (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={selected}
          className={`vt-chip vt-pressable${selected ? ' vt-chip--selected' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);
