import type { BillingInterval } from '@ventea/shared';
import { useId } from 'react';

/** Mensual / anual como grupo de radios: navegable con flechas y anunciado como tal. */
export function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) {
  const name = useId();
  const options: { value: BillingInterval; label: string; extra?: string }[] = [
    { value: 'month', label: 'Mensual' },
    { value: 'year', label: 'Anual', extra: '2 meses gratis' },
  ];
  return (
    <fieldset className="toggle">
      <legend className="sr-only">Forma de pago</legend>
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
