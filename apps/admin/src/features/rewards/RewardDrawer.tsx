import type { RewardCatalogInput, RewardCatalogItem, StaffMenu } from '@ventea/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { centsToInput, currencySymbol, parseMoneyInput } from '@/features/menu/money';
import { describeError, useI18n } from '@/i18n';
import { Drawer } from '@/ui/Drawer';

import { useSaveReward } from './api';

interface Draft {
  name: string;
  pointsCost: string;
  kind: 'item' | 'discount';
  menuItemId: string;
  discount: string;
  isActive: boolean;
}

type Errors = Partial<Record<'name' | 'pointsCost' | 'menuItemId' | 'discount', string>>;

function draftOf(reward: RewardCatalogItem | null): Draft {
  return {
    name: reward?.name ?? '',
    pointsCost: reward ? String(reward.pointsCost) : '',
    kind: reward?.kind ?? 'item',
    // Un producto borrado no se puede elegir: obliga a elegir otro.
    menuItemId: reward?.menuItemName ? (reward.menuItemId ?? '') : '',
    discount: centsToInput(reward?.discountCents ?? null),
    isActive: reward?.isActive ?? true,
  };
}

/** Alta o edición de una recompensa del catálogo: nombre, costo, producto o descuento, visible. */
export function RewardDrawer({
  reward,
  menu,
  currency,
  onClose,
  onSaved,
}: {
  reward: RewardCatalogItem | null;
  menu: StaffMenu | undefined;
  currency: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const id = useId();
  const save = useSaveReward();
  const [draft, setDraft] = useState<Draft>(() => draftOf(reward));
  const [errors, setErrors] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);

  // Un error al guardar re-habilita el botón, pero el foco ya cayó al <body>: vuelve al panel.
  useEffect(() => {
    if (!save.isPending && document.activeElement === document.body) form.current?.focus();
  }, [save.isPending]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const toInput = (): RewardCatalogInput | null => {
    const found: Errors = {};
    const name = draft.name.trim();
    const cost = /^\d{1,8}$/.test(draft.pointsCost.trim()) ? Number(draft.pointsCost.trim()) : 0;
    if (!name) found.name = t('rewards.nameRequired');
    if (cost < 1) found.pointsCost = t('rewards.costInvalid');
    const discountCents = parseMoneyInput(draft.discount);
    if (draft.kind === 'item' && !draft.menuItemId) found.menuItemId = t('rewards.productRequired');
    if (draft.kind === 'discount' && (discountCents === null || discountCents < 1)) {
      found.discount = t('rewards.discountInvalid');
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return null;
    const base = { name, pointsCost: cost, isActive: draft.isActive };
    return draft.kind === 'item'
      ? { ...base, kind: 'item', menuItemId: draft.menuItemId }
      : { ...base, kind: 'discount', discountCents: discountCents ?? 0 };
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const input = toInput();
    if (!input) return;
    save.mutate({ id: reward?.id ?? null, input }, { onSuccess: () => onSaved(input.name) });
  };

  const describedBy = (key: keyof Errors, hint?: string) =>
    [hint, errors[key] ? `${id}-${key}-error` : ''].filter(Boolean).join(' ') || undefined;
  const fieldError = (key: keyof Errors) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} className="field__error">
        {errors[key]}
      </p>
    ) : null;

  return (
    <Drawer
      title={reward ? t('rewards.editTitle') : t('rewards.newTitle')}
      busy={save.isPending}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={save.isPending}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form={`${id}-form`}
            className="btn btn--primary"
            disabled={save.isPending}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        ref={form}
        tabIndex={-1}
        className="form-grid"
        onSubmit={onSubmit}
        noValidate
      >
        <div className="field">
          <label className="field__label" htmlFor={`${id}-name`}>
            {t('rewards.name')}
          </label>
          <input
            id={`${id}-name`}
            className="field__input"
            data-autofocus
            maxLength={60}
            placeholder={t('rewards.namePlaceholder')}
            value={draft.name}
            aria-invalid={!!errors.name}
            aria-describedby={describedBy('name')}
            onChange={(event) => set('name', event.target.value)}
          />
          {fieldError('name')}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${id}-cost`}>
            {t('rewards.cost')}
          </label>
          <input
            id={`${id}-cost`}
            className="field__input"
            inputMode="numeric"
            autoComplete="off"
            value={draft.pointsCost}
            aria-invalid={!!errors.pointsCost}
            aria-describedby={describedBy('pointsCost')}
            onChange={(event) => set('pointsCost', event.target.value)}
          />
          {fieldError('pointsCost')}
        </div>

        <fieldset className="rw-kind">
          <legend className="field__label">{t('rewards.kind')}</legend>
          <div className="segmented rw-kind__options">
            {(['item', 'discount'] as const).map((kind) => (
              <label
                key={kind}
                className={`segmented__item rw-kind__option${draft.kind === kind ? ' active' : ''}`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`${id}-kind`}
                  value={kind}
                  checked={draft.kind === kind}
                  onChange={() => set('kind', kind)}
                />
                {kind === 'item' ? t('rewards.kindItem') : t('rewards.kindDiscount')}
              </label>
            ))}
          </div>
        </fieldset>

        {draft.kind === 'item' ? (
          <div className="field">
            <label className="field__label" htmlFor={`${id}-item`}>
              {t('rewards.product')}
            </label>
            <select
              id={`${id}-item`}
              className="field__input"
              value={draft.menuItemId}
              aria-invalid={!!errors.menuItemId}
              aria-describedby={describedBy('menuItemId')}
              onChange={(event) => set('menuItemId', event.target.value)}
            >
              <option value="">{t('rewards.chooseProduct')}</option>
              {menu?.categories.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  {category.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {fieldError('menuItemId')}
          </div>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor={`${id}-discount`}>
              {t('rewards.discountAmount')} ({currencySymbol(currency, locale)})
            </label>
            <input
              id={`${id}-discount`}
              className="field__input"
              inputMode="decimal"
              autoComplete="off"
              value={draft.discount}
              aria-invalid={!!errors.discount}
              aria-describedby={describedBy('discount')}
              onChange={(event) => set('discount', event.target.value)}
            />
            {fieldError('discount')}
          </div>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={draft.isActive}
          className="switch"
          onClick={() => set('isActive', !draft.isActive)}
        >
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span className="switch__text rw-switch-text">{t('rewards.visible')}</span>
        </button>

        {save.error && (
          <p className="form-error" role="alert">
            {describeError(save.error, i18n)}
          </p>
        )}
      </form>
    </Drawer>
  );
}
