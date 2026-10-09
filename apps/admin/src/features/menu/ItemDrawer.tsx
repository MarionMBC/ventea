import {
  MENU_MAX_CENTS,
  MENU_TAG_MAX,
  type StaffMenu,
  type StaffMenuItem,
  type UpdateMenuItemInput,
} from '@ventea/shared';
import { useId, useState, type FormEvent } from 'react';

import { describeError, useI18n } from '@/i18n';
import { Drawer } from '@/ui/Drawer';
import { ImageUpload } from '@/ui/ImageUpload';

import { useCreateItem, useUpdateItem } from './api';
import { groupRule } from './groupRule';
import { centsToInput, currencySymbol, parseMoneyInput } from './money';

interface Draft {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  compareAt: string;
  tags: string;
  isAvailable: boolean;
  imageUrl: string | null;
  modifierGroupIds: string[];
}

function draftOf(item: StaffMenuItem | null, categoryId: string): Draft {
  return {
    name: item?.name ?? '',
    description: item?.description ?? '',
    categoryId: item?.categoryId ?? categoryId,
    price: centsToInput(item?.basePriceCents ?? null),
    compareAt: centsToInput(item?.compareAtPriceCents ?? null),
    tags: item?.tags.join(', ') ?? '',
    isAvailable: item?.isAvailable ?? true,
    imageUrl: item?.imageUrl ?? null,
    modifierGroupIds: item?.modifierGroupIds ?? [],
  };
}

function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Editor de un producto en un panel lateral: datos, precio en la moneda de la marca, foto,
 * etiquetas, disponibilidad y grupos de modificadores. Al editar solo manda lo que cambió
 * (una foto heredada que no se tocó no se reenvía).
 */
export function ItemDrawer({
  menu,
  item,
  categoryId,
  onClose,
  onSaved,
}: {
  menu: StaffMenu;
  item: StaffMenuItem | null;
  categoryId: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const i18n = useI18n();
  const { t, locale, money } = i18n;
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(item, categoryId));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [uploading, setUploading] = useState(false);
  const create = useCreateItem();
  const update = useUpdateItem();
  const pending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;
  const symbol = currencySymbol(menu.currency, locale);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const toggleGroup = (id: string, on: boolean) =>
    set(
      'modifierGroupIds',
      on ? [...draft.modifierGroupIds, id] : draft.modifierGroupIds.filter((g) => g !== id),
    );

  const validate = () => {
    const found: Partial<Record<keyof Draft, string>> = {};
    const price = parseMoneyInput(draft.price);
    const compareAt = draft.compareAt.trim() ? parseMoneyInput(draft.compareAt) : null;
    const tags = parseTags(draft.tags);
    if (!draft.name.trim()) found.name = t('item.nameRequired');
    const tooHigh = t('item.priceTooHigh', { max: money(MENU_MAX_CENTS, menu.currency) });
    if (price === null) found.price = t('item.priceInvalid');
    else if (price > MENU_MAX_CENTS) found.price = tooHigh;
    if (draft.compareAt.trim() && compareAt === null) found.compareAt = t('item.priceInvalid');
    else if (compareAt !== null && compareAt > MENU_MAX_CENTS) found.compareAt = tooHigh;
    else if (compareAt !== null && price !== null && compareAt <= price) {
      found.compareAt = t('item.compareAtTooLow');
    }
    if (tags.length > MENU_TAG_MAX) found.tags = t('item.tooManyTags', { max: MENU_TAG_MAX });
    else if (tags.some((tag) => tag.length > 30)) found.tags = t('item.tagTooLong');
    setErrors(found);
    return Object.keys(found).length === 0 ? { price: price!, compareAt, tags } : null;
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || uploading) return;
    const valid = validate();
    if (!valid) return;
    const name = draft.name.trim();
    const description = draft.description.trim() || null;
    const done = { onSuccess: () => onSaved(name) };

    if (!item) {
      create.mutate(
        {
          categoryId: draft.categoryId,
          name,
          description,
          basePriceCents: valid.price,
          compareAtPriceCents: valid.compareAt,
          tags: valid.tags,
          isAvailable: draft.isAvailable,
          imageUrl: draft.imageUrl,
          modifierGroupIds: draft.modifierGroupIds,
        },
        done,
      );
      return;
    }

    const patch: UpdateMenuItemInput = {};
    if (name !== item.name) patch.name = name;
    if (description !== item.description) patch.description = description;
    if (draft.categoryId !== item.categoryId) patch.categoryId = draft.categoryId;
    if (valid.price !== item.basePriceCents) patch.basePriceCents = valid.price;
    if (valid.compareAt !== item.compareAtPriceCents) patch.compareAtPriceCents = valid.compareAt;
    if (!sameList(valid.tags, item.tags)) patch.tags = valid.tags;
    if (draft.isAvailable !== item.isAvailable) patch.isAvailable = draft.isAvailable;
    if (draft.imageUrl !== item.imageUrl) patch.imageUrl = draft.imageUrl;
    if (!sameList(draft.modifierGroupIds, item.modifierGroupIds)) {
      patch.modifierGroupIds = draft.modifierGroupIds;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: item.id, patch }, done);
  };

  const fieldError = (key: keyof Draft) =>
    errors[key] ? (
      <p id={`${formId}-${key}-error`} className="field__error">
        {errors[key]}
      </p>
    ) : null;
  const describedBy = (key: keyof Draft, hint?: boolean) =>
    [errors[key] ? `${formId}-${key}-error` : '', hint ? `${formId}-${key}-hint` : '']
      .filter(Boolean)
      .join(' ') || undefined;

  // Seleccionados primero, en su orden; después el resto.
  const groups = [
    ...draft.modifierGroupIds.flatMap((id) => menu.modifierGroups.filter((g) => g.id === id)),
    ...menu.modifierGroups.filter((g) => !draft.modifierGroupIds.includes(g.id)),
  ];

  return (
    <Drawer
      title={item ? t('item.editTitle') : t('item.newTitle')}
      subtitle={item?.name}
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form={formId}
            className="btn btn--primary"
            disabled={pending || uploading}
          >
            {pending ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={onSubmit} noValidate>
        {failure && (
          <p className="form-error" role="alert">
            {describeError(failure, i18n)}
          </p>
        )}

        <div className="field">
          <label className="field__label" htmlFor={`${formId}-name`}>
            {t('item.name')}
          </label>
          <input
            id={`${formId}-name`}
            className="field__input"
            value={draft.name}
            maxLength={120}
            required
            data-autofocus
            aria-invalid={!!errors.name}
            aria-describedby={describedBy('name')}
            onChange={(event) => set('name', event.target.value)}
          />
          {fieldError('name')}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${formId}-description`}>
            {t('item.description')} <span className="field__optional">{t('common.optional')}</span>
          </label>
          <textarea
            id={`${formId}-description`}
            className="field__input field__input--area"
            rows={3}
            maxLength={500}
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${formId}-category`}>
            {t('item.category')}
          </label>
          <select
            id={`${formId}-category`}
            className="field__input"
            value={draft.categoryId}
            onChange={(event) => set('categoryId', event.target.value)}
          >
            {menu.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="field">
            <label className="field__label" htmlFor={`${formId}-price`}>
              {t('item.price', { currency: menu.currency })}
            </label>
            <div className="money-input">
              <span className="money-input__symbol" aria-hidden="true">
                {symbol}
              </span>
              <input
                id={`${formId}-price`}
                className="field__input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={draft.price}
                aria-invalid={!!errors.price}
                aria-describedby={describedBy('price')}
                onChange={(event) => set('price', event.target.value)}
              />
            </div>
            {fieldError('price')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${formId}-compareAt`}>
              {t('item.compareAt')} <span className="field__optional">{t('common.optional')}</span>
            </label>
            <div className="money-input">
              <span className="money-input__symbol" aria-hidden="true">
                {symbol}
              </span>
              <input
                id={`${formId}-compareAt`}
                className="field__input"
                inputMode="decimal"
                autoComplete="off"
                value={draft.compareAt}
                aria-invalid={!!errors.compareAt}
                aria-describedby={describedBy('compareAt', true)}
                onChange={(event) => set('compareAt', event.target.value)}
              />
            </div>
            <p id={`${formId}-compareAt-hint`} className="field__hint">
              {t('item.compareAtHint')}
            </p>
            {fieldError('compareAt')}
          </div>
        </div>

        <ImageUpload
          label={t('item.photo')}
          hint={t('upload.hint')}
          value={draft.imageUrl}
          onChange={(url) => set('imageUrl', url)}
          onBusyChange={setUploading}
          disabled={pending}
        />

        <div className="field">
          <label className="field__label" htmlFor={`${formId}-tags`}>
            {t('item.tags')} <span className="field__optional">{t('common.optional')}</span>
          </label>
          <input
            id={`${formId}-tags`}
            className="field__input"
            value={draft.tags}
            placeholder={t('item.tagsPlaceholder')}
            aria-invalid={!!errors.tags}
            aria-describedby={describedBy('tags', true)}
            onChange={(event) => set('tags', event.target.value)}
          />
          <p id={`${formId}-tags-hint`} className="field__hint">
            {t('item.tagsHint', { max: MENU_TAG_MAX })}
          </p>
          {fieldError('tags')}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={draft.isAvailable}
            onChange={(event) => set('isAvailable', event.target.checked)}
          />
          <span>
            <span className="check__label">{t('item.availableNow')}</span>
            <span className="field__hint">{t('item.availableHint')}</span>
          </span>
        </label>

        <fieldset className="fieldset">
          <legend className="field__label">{t('item.modifiers')}</legend>
          {menu.modifierGroups.length === 0 ? (
            <p className="field__hint">{t('item.noGroups')}</p>
          ) : (
            <ul className="check-list">
              {groups.map((group) => {
                const position = draft.modifierGroupIds.indexOf(group.id);
                return (
                  <li key={group.id}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={position >= 0}
                        onChange={(event) => toggleGroup(group.id, event.target.checked)}
                      />
                      <span>
                        <span className="check__label">
                          {position >= 0 && <span className="check__order">{position + 1}</span>}
                          {group.name}
                        </span>
                        <span className="field__hint">
                          {groupRule(group, t)} ·{' '}
                          {group.options.map((option) => option.name).join(', ') ||
                            t('group.noOptions')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      </form>
    </Drawer>
  );
}
