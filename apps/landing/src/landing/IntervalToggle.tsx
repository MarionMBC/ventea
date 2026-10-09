import type { BillingInterval } from '@ventea/shared';
import { useId } from 'react';

import { useT } from '@/i18n';

/** Mensual / anual como grupo de radios: navegable con flechas y anunciado como tal. */
export function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) {
  const t = useT().toggle;
  const name = useId();
  const options: { value: BillingInterval; label: string; extra?: string }[] = [
    { value: 'month', label: t.monthly },
    { value: 'year', label: t.yearly, extra: t.yearlyExtra },
  ];
  return (
    <fieldset className="toggle">
      <legend className="sr-only">{t.legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={`toggle__option${value === option.value ? ' is-active' : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
          {option.extra && <span className="toggle__extra">{option.extra}</span>}
        </label>
      ))}
    </fieldset>
  );
}
