import { isHexColor, textContrastOn, WCAG_AA_NORMAL, type BrandWarning } from '@ventea/shared';
import { useId, useState } from 'react';

import { useI18n } from '@/i18n';
import { IconAlert, IconCheck } from '@/ui/icons';

const HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * Advertencia de contraste del color: la de la API si el color es el guardado (es la que vale),
 * o la misma cuenta hecha acá (`textContrastOn` de shared, igual que la API) mientras se edita.
 */
export function contrastWarning(
  field: BrandWarning['field'],
  color: string,
  saved: { color: string | null; warnings: BrandWarning[] },
): Pick<BrandWarning, 'whiteRatio' | 'blackRatio' | 'recommendedTextColor'> | null {
  if (!isHexColor(color)) return null;
  if (saved.color?.toLowerCase() === color.toLowerCase()) {
    return saved.warnings.find((warning) => warning.field === field) ?? null;
  }
  const { white, black } = textContrastOn(color);
  if (white >= WCAG_AA_NORMAL) return null;
  return {
    whiteRatio: white,
    blackRatio: black,
    recommendedTextColor: black > white ? 'black' : 'white',
  };
}

const ratio = (value: number) => (Math.floor(value * 10) / 10).toFixed(1);

/** Selector de color (nativo) + hex editable, con la advertencia de contraste debajo. */
export function ColorField({
  field,
  label,
  hint,
  value,
  onChange,
  saved,
  optional,
  onInvalid,
}: {
  field: BrandWarning['field'];
  label: string;
  hint?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  saved: { color: string | null; warnings: BrandWarning[] };
  /** El acento puede no estar: se ofrece quitarlo / agregarlo. */
  optional?: boolean;
  /** Avisa si el hex escrito está a medias o mal: el formulario no debe guardarse así. */
  onInvalid?: (field: BrandWarning['field'], invalid: boolean) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const [synced, setSynced] = useState(value);

  // Un cambio desde afuera (el selector, descartar, guardar) reemplaza lo escrito.
  if (value !== synced) {
    setSynced(value);
    setText(value ?? '');
  }

  const warning = value ? contrastWarning(field, value, saved) : null;
  const invalid = text !== '' && !HEX6.test(text);
  const messageId = `${id}-contrast`;

  if (optional && value === null) {
    return (
      <div className="field color-field">
        <span className="field__label">{label}</span>
        {hint && <p className="field__hint">{hint}</p>}
        <button
          type="button"
          className="btn btn--ghost btn--small color-field__add"
          onClick={() => onChange(saved.color ?? '#f5b700')}
        >
          {t('brand.addAccent')}
        </button>
      </div>
    );
  }

  return (
    <div className="field color-field">
      <label className="field__label" htmlFor={`${id}-hex`}>
        {label}
      </label>
      {hint && <p className="field__hint">{hint}</p>}
      <div className="color-field__row">
        <input
          type="color"
          className="color-field__swatch"
          value={value && HEX6.test(value) ? value.toLowerCase() : '#000000'}
          aria-label={t('brand.pickColor', { label })}
          onChange={(event) => {
            onInvalid?.(field, false);
            onChange(event.target.value.toLowerCase());
          }}
        />
        <input
          id={`${id}-hex`}
          className="field__input color-field__hex"
          value={text}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={messageId}
          onChange={(event) => {
            const next = event.target.value.trim();
            const withHash = next && !next.startsWith('#') ? `#${next}` : next;
            setText(withHash);
            const valid = withHash === '' || HEX6.test(withHash);
            onInvalid?.(field, !valid || withHash === '');
            if (HEX6.test(withHash)) onChange(withHash.toLowerCase());
          }}
        />
        {optional && (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => {
              onInvalid?.(field, false);
              onChange(null);
            }}
          >
            {t('brand.removeAccent')}
          </button>
        )}
      </div>
      <p
        id={messageId}
        className={`contrast${invalid ? ' contrast--error' : warning ? ' contrast--warn' : ' contrast--ok'}`}
      >
        {invalid ? (
          <>
            <IconAlert size={16} /> {t('brand.colorInvalid')}
          </>
        ) : warning ? (
          <>
            <IconAlert size={16} />{' '}
            {t(
              warning.recommendedTextColor === 'black'
                ? 'brand.contrastUseBlack'
                : 'brand.contrastLow',
              { white: ratio(warning.whiteRatio), black: ratio(warning.blackRatio) },
            )}
          </>
        ) : (
          <>
            <IconCheck size={16} /> {t('brand.contrastOk')}
          </>
        )}
      </p>
    </div>
  );
}
