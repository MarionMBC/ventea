import type { RewardProgram, UpdateRewardProgramInput } from '@ventea/shared';
import { useId, useState, type FormEvent } from 'react';

import { centsToInput, parseMoneyInput } from '@/features/menu/money';
import { describeError, useI18n } from '@/i18n';
import { IconStar } from '@/ui/icons';

import { useUpdateProgram } from './api';

interface Draft {
  isEnabled: boolean;
  pointsPerCurrencyUnit: string;
  redemptionValue: string;
  minPointsToRedeem: string;
  signupBonusPoints: string;
}

type Field = Exclude<keyof Draft, 'isEnabled'>;

function draftOf(program: RewardProgram): Draft {
  return {
    isEnabled: program.isEnabled,
    pointsPerCurrencyUnit: String(program.pointsPerCurrencyUnit),
    redemptionValue: centsToInput(program.redemptionValueCents),
    minPointsToRedeem: String(program.minPointsToRedeem),
    signupBonusPoints: String(program.signupBonusPoints),
  };
}

/** Puntos por unidad: número de 0 a 1000 con hasta 2 decimales (coma o punto). */
export function parseRate(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) return null;
  const rate = Number(value);
  return rate <= 1000 ? rate : null;
}

function parseWhole(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,8}$/.test(value)) return null;
  return Number(value);
}

/** Lo escrito → cuerpo del PUT, o los errores por campo. */
export function programInput(
  draft: Draft,
): { input: UpdateRewardProgramInput } | { errors: Partial<Record<Field, true>> } {
  const rate = parseRate(draft.pointsPerCurrencyUnit);
  const value = parseMoneyInput(draft.redemptionValue);
  const min = parseWhole(draft.minPointsToRedeem);
  const bonus = parseWhole(draft.signupBonusPoints);
  const errors: Partial<Record<Field, true>> = {};
  if (rate === null) errors.pointsPerCurrencyUnit = true;
  if (value === null) errors.redemptionValue = true;
  if (min === null) errors.minPointsToRedeem = true;
  if (bonus === null) errors.signupBonusPoints = true;
  if (rate === null || value === null || min === null || bonus === null) return { errors };
  return {
    input: {
      isEnabled: draft.isEnabled,
      pointsPerCurrencyUnit: rate,
      redemptionValueCents: value,
      minPointsToRedeem: min,
      signupBonusPoints: bonus,
    },
  };
}

/** Reglas del programa: activo, puntos por unidad, valor del punto, mínimo y bono de registro. */
export function ProgramCard({ program, currency }: { program: RewardProgram; currency: string }) {
  const i18n = useI18n();
  const { t, money } = i18n;
  const id = useId();
  const update = useUpdateProgram();
  const saved = draftOf(program);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, true>>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const current = draft ?? saved;
  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((key) => current[key] !== saved[key]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...(prev ?? saved), [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setFlash(null);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || update.isPending) return;
    const parsed = programInput(current);
    if ('errors' in parsed) {
      setErrors(parsed.errors);
      return;
    }
    update.mutate(parsed.input, {
      onSuccess: () => {
        setDraft(null);
        setFlash(t('rewards.saved'));
      },
    });
  };

  const discard = () => {
    setDraft(null);
    setErrors({});
    update.reset();
  };

  const rate = parseRate(current.pointsPerCurrencyUnit);
  const unit = money(100, currency);
  const exampleSpend = 2500;

  const field = (
    key: Field,
    label: string,
    hint: string | null,
    error: string,
    inputMode: 'decimal' | 'numeric',
  ) => (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-${key}`}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        className="field__input"
        inputMode={inputMode}
        autoComplete="off"
        value={current[key]}
        aria-invalid={!!errors[key]}
        aria-describedby={
          [hint ? `${id}-${key}-hint` : '', errors[key] ? `${id}-${key}-error` : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => set(key, event.target.value)}
      />
      {hint && (
        <p id={`${id}-${key}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {errors[key] && (
        <p id={`${id}-${key}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <form
      className="card rw-program"
      aria-labelledby={`${id}-title`}
      onSubmit={onSubmit}
      noValidate
    >
      <div className="card__head">
        <span className="card__icon" aria-hidden="true">
          <IconStar size={20} />
        </span>
        <h2 id={`${id}-title`}>{t('rewards.program')}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={current.isEnabled}
          aria-label={t('rewards.programAria')}
          className="switch rw-program__switch"
          disabled={update.isPending}
          onClick={() => set('isEnabled', !current.isEnabled)}
        >
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span className="switch__text">
            {current.isEnabled ? t('rewards.on') : t('rewards.off')}
          </span>
        </button>
      </div>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}
      {!current.isEnabled && <p className="banner banner--warn">{t('rewards.offHint')}</p>}

      <fieldset className="rw-program__fields" disabled={update.isPending}>
        <div className="form-row">
          {field(
            'pointsPerCurrencyUnit',
            t('rewards.pointsPerUnit', { unit }),
            t('rewards.pointsPerUnitHint', { unit2: money(200, currency) }),
            t('rewards.rateInvalid'),
            'decimal',
          )}
          {field(
            'redemptionValue',
            t('rewards.pointValue'),
            t('rewards.pointValueHint'),
            t('rewards.amountInvalid'),
            'decimal',
          )}
        </div>
        <div className="form-row">
          {field(
            'minPointsToRedeem',
            t('rewards.minRedeem'),
            null,
            t('rewards.wholeInvalid'),
            'numeric',
          )}
          {field(
            'signupBonusPoints',
            t('rewards.signupBonus'),
            t('rewards.signupBonusHint'),
            t('rewards.wholeInvalid'),
            'numeric',
          )}
        </div>
        {rate !== null && (
          <p className="muted" aria-live="polite">
            {t('rewards.example', {
              spend: money(exampleSpend, currency),
              points: Math.floor((exampleSpend / 100) * rate + 1e-9),
            })}
          </p>
        )}
      </fieldset>

      {update.error && (
        <p className="form-error" role="alert">
          {describeError(update.error, i18n)}
        </p>
      )}

      <div className={`savebar rw-program__savebar${dirty ? ' is-dirty' : ''}`}>
        <span className="savebar__text" role="status">
          {dirty ? t('rewards.unsaved') : t('rewards.allSaved')}
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={discard}
          disabled={!dirty || update.isPending}
        >
          {t('rewards.discard')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={!dirty || update.isPending}>
          {update.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
