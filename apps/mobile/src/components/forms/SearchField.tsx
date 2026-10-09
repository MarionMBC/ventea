import { t } from '../../i18n';
import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './forms.css';

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** Accessible name; there is no visible label inside a search header. */
  label?: string;
  /** Pill shape in headers, square when embedded in a form. */
  pill?: boolean;
  onClear?: () => void;
}

/**
 * Search input. Deliberately label-less on screen — it always sits next to a
 * magnifier in a header where a visible label would cost a whole row — but
 * never label-less to assistive technology.
 */
export const SearchField = ({
  label = t('menu.searchLabel'),
  pill = true,
  value,
  onClear,
  id,
  ...rest
}: SearchFieldProps) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hasValue = typeof value === 'string' && value.length > 0;

  return (
    <div className={`vt-control${pill ? ' vt-control--pill' : ''}`}>
      <IonIcon aria-hidden="true" className="vt-control__icon" icon={icons.searchOutline} />
      <input
        id={fieldId}
        type="search"
        aria-label={label}
        className="vt-control__input"
        value={value}
        {...rest}
      />
      {hasValue && onClear && (
        <button
          type="button"
          className="vt-control__reveal"
          onClick={onClear}
          aria-label={t('a11y.clearSearch')}
        >
          <IonIcon aria-hidden="true" icon={icons.close} />
        </button>
      )}
    </div>
  );
};
