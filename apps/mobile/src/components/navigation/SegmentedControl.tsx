import './navigation.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not selectable, e.g. "Delivery · Soon" before it launches. */
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the whole control, e.g. "Modo de entrega". */
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Two-to-three way switch (delivery / pickup). Implemented as a tablist so
 * arrow keys work on the web build, which `IonSegment` does not give us with
 * the pill styling this brand uses.
 */
export const SegmentedControl = <T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) => (
  <div className="vt-segment" role="tablist" aria-label={label}>
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={selected}
          tabIndex={selected ? 0 : -1}
          disabled={option.disabled}
          aria-disabled={option.disabled || undefined}
          className={`vt-segment__option vt-pressable${
            selected ? ' vt-segment__option--selected' : ''
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
