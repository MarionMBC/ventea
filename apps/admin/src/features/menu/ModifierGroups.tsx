import { MENU_MAX_CENTS, type StaffMenu, type StaffModifierGroup } from '@ventea/shared';
import { useId, useState, type FormEvent } from 'react';

import { describeError, useI18n } from '@/i18n';
import { Drawer } from '@/ui/Drawer';
import { IconArrowDown, IconArrowUp, IconEdit, IconLayers, IconPlus, IconTrash } from '@/ui/icons';

import { useSaveGroup, type GroupDraft, type OptionDraft } from './api';
import { groupRule } from './groupRule';
import { centsToInput, currencySymbol, parseMoneyInput } from './money';
import { moveIndex } from './reorder';

/** Grupos de modificadores (picante, extras, salsas…): se arman una vez y se usan en varios ítems. */
export function ModifierGroups({
  menu,
  canEdit,
  onNew,
  onEdit,
  onDelete,
}: {
  menu: StaffMenu;
  canEdit: boolean;
  onNew: () => void;
  onEdit: (group: StaffModifierGroup) => void;
  onDelete: (group: StaffModifierGroup) => void;
}) {
  const { t, money } = useI18n();
  const signed = (cents: number) =>
    cents === 0 ? '' : `${cents > 0 ? '+' : '−'}${money(Math.abs(cents), menu.currency)}`;

  if (menu.modifierGroups.length === 0) {
    return (
      <div className="state state--empty">
        <span className="state__icon">
          <IconLayers size={28} />
        </span>
        <h2>{t('group.emptyTitle')}</h2>
        <p>{t('group.emptyBody')}</p>
        {canEdit && (
          <button type="button" className="btn btn--primary" onClick={onNew}>
            <IconPlus size={18} />
            {t('group.new')}
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="group-list">
      {menu.modifierGroups.map((group) => (
        <li key={group.id} className="group-card">
          <div className="group-card__head">
            <div>
              <h2 className="group-card__name">{group.name}</h2>
              <p className="group-card__meta">
                {groupRule(group, t)} · {t('group.usedBy', { count: group.itemCount })}
              </p>
            </div>
            {canEdit && (
              <div className="group-card__actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('group.editAria', { name: group.name })}
                  onClick={() => onEdit(group)}
                >
                  <IconEdit size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  aria-label={t('group.deleteAria', { name: group.name })}
                  onClick={() => onDelete(group)}
                >
                  <IconTrash size={18} />
                </button>
              </div>
            )}
          </div>
          {group.options.length === 0 ? (
            <p className="field__hint">{t('group.noOptions')}</p>
          ) : (
            <ul className="group-card__options">
              {group.options.map((option) => (
                <li key={option.id} className={`tag${option.isAvailable ? '' : ' tag--muted'}`}>
                  {option.name}
                  {option.priceDeltaCents !== 0 && (
                    <span className="tag__extra">{signed(option.priceDeltaCents)}</span>
                  )}
                  {!option.isAvailable && <span className="sr-only"> ({t('item.soldOut')})</span>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

interface OptionRow {
  key: string;
  id?: string;
  name: string;
  price: string;
  isAvailable: boolean;
}

let rowSeq = 0;
const newRow = (option?: StaffModifierGroup['options'][number]): OptionRow => ({
  key: option?.id ?? `new-${++rowSeq}`,
  id: option?.id,
  name: option?.name ?? '',
  price: option ? centsToInput(option.priceDeltaCents) : '',
  isAvailable: option?.isAvailable ?? true,
});

/** Editor de un grupo y sus opciones, en el panel lateral. */
export function GroupDrawer({
  menu,
  group,
  onClose,
  onSaved,
}: {
  menu: StaffMenu;
  group: StaffModifierGroup | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const i18n = useI18n();
  const { t, locale, money } = i18n;
  const formId = useId();
  const save = useSaveGroup();
  const [name, setName] = useState(group?.name ?? '');
  const [min, setMin] = useState(String(group?.minSelect ?? 0));
  const [max, setMax] = useState(String(group?.maxSelect ?? 1));
  const [rows, setRows] = useState<OptionRow[]>(() =>
    group ? group.options.map((o) => newRow(o)) : [newRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const symbol = currencySymbol(menu.currency, locale);

  const update = (key: string, patch: Partial<OptionRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  /** Borrador válido y la fila (`key`) de cada opción, en el mismo orden. */
  const validate = (): { draft: GroupDraft; keys: string[] } | null => {
    const minSelect = Number(min);
    const maxSelect = Number(max);
    if (!name.trim()) return fail(t('group.nameRequired'));
    if (!Number.isInteger(minSelect) || minSelect < 0 || minSelect > 50) {
      return fail(t('group.minInvalid'));
    }
    if (!Number.isInteger(maxSelect) || maxSelect < 1 || maxSelect > 50) {
      return fail(t('group.maxInvalid'));
    }
    if (minSelect > maxSelect) return fail(t('group.minOverMax'));
    const options: OptionDraft[] = [];
    const keys: string[] = [];
    for (const row of rows) {
      if (!row.name.trim() && !row.price.trim() && !row.id) continue; // fila vacía nueva
      if (!row.name.trim()) return fail(t('group.optionNameRequired'));
      const cents = row.price.trim() ? parseMoneyInput(row.price, { allowNegative: true }) : 0;
      if (cents === null) return fail(t('group.optionPriceInvalid', { name: row.name.trim() }));
      if (Math.abs(cents) > MENU_MAX_CENTS) {
        return fail(t('item.priceTooHigh', { max: money(MENU_MAX_CENTS, menu.currency) }));
      }
      keys.push(row.key);
      options.push({
        id: row.id,
        name: row.name.trim(),
        priceDeltaCents: cents,
        isAvailable: row.isAvailable,
      });
    }
    if (options.length > 50) return fail(t('group.tooManyOptions'));
    setError(null);
    return { draft: { name: name.trim(), minSelect, maxSelect, options }, keys };
  };

  function fail(message: string): null {
    setError(message);
    return null;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const valid = validate();
    if (!valid) return;
    const { draft, keys } = valid;
    // El grupo como está ahora (el menú se recarga tras cada intento), no como estaba al abrir:
    // si un intento anterior falló a mitad, lo ya aplicado no se repite.
    const original = group
      ? (menu.modifierGroups.find((candidate) => candidate.id === group.id) ?? group)
      : null;
    save.mutate(
      {
        original,
        draft,
        onCreated: (index, id) => {
          const key = keys[index];
          setRows((current) => current.map((row) => (row.key === key ? { ...row, id } : row)));
        },
      },
      { onSuccess: () => onSaved(draft.name) },
    );
  };

  const shownError = error ?? (save.error ? describeError(save.error, i18n) : null);

  return (
    <Drawer
      title={group ? t('group.editTitle') : t('group.newTitle')}
      subtitle={group?.name}
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
            form={formId}
            className="btn btn--primary"
            disabled={save.isPending}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={onSubmit} noValidate>
        {shownError && (
          <p className="form-error" role="alert">
            {shownError}
          </p>
        )}
        <div className="field">
          <label className="field__label" htmlFor={`${formId}-name`}>
            {t('group.name')}
          </label>
          <input
            id={`${formId}-name`}
            className="field__input"
            value={name}
            maxLength={80}
            placeholder={t('group.namePlaceholder')}
            data-autofocus
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field__label" htmlFor={`${formId}-min`}>
              {t('group.min')}
            </label>
            <input
              id={`${formId}-min`}
              className="field__input"
              type="number"
              min={0}
              max={50}
              inputMode="numeric"
              value={min}
              aria-describedby={`${formId}-min-hint`}
              onChange={(event) => setMin(event.target.value)}
            />
            <p id={`${formId}-min-hint`} className="field__hint">
              {t('group.minHint')}
            </p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${formId}-max`}>
              {t('group.max')}
            </label>
            <input
              id={`${formId}-max`}
              className="field__input"
              type="number"
              min={1}
              max={50}
              inputMode="numeric"
              value={max}
              onChange={(event) => setMax(event.target.value)}
            />
          </div>
        </div>

        <fieldset className="fieldset">
          <legend className="field__label">{t('group.options')}</legend>
          <p className="field__hint">{t('group.optionsHint')}</p>
          <ol className="option-rows">
            {rows.map((row, index) => (
              <li key={row.key} className="option-row">
                <input
                  className="field__input option-row__name"
                  aria-label={t('group.optionName', { n: index + 1 })}
                  placeholder={t('group.optionNamePlaceholder')}
                  maxLength={80}
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                />
                <div className="money-input option-row__price">
                  <span className="money-input__symbol" aria-hidden="true">
                    {symbol}
                  </span>
                  <input
                    className="field__input"
                    inputMode="decimal"
                    aria-label={t('group.optionPrice', { n: index + 1 })}
                    placeholder="0.00"
                    value={row.price}
                    onChange={(event) => update(row.key, { price: event.target.value })}
                  />
                </div>
                <label className="check option-row__available">
                  <input
                    type="checkbox"
                    checked={row.isAvailable}
                    onChange={(event) => update(row.key, { isAvailable: event.target.checked })}
                  />
                  <span className="check__label">{t('item.available')}</span>
                </label>
                <div className="option-row__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('group.optionUp', { n: index + 1 })}
                    disabled={index === 0}
                    onClick={() => setRows((current) => moveIndex(current, index, index - 1))}
                  >
                    <IconArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('group.optionDown', { n: index + 1 })}
                    disabled={index === rows.length - 1}
                    onClick={() => setRows((current) => moveIndex(current, index, index + 1))}
                  >
                    <IconArrowDown size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={t('group.optionRemove', { n: index + 1 })}
                    onClick={() =>
                      setRows((current) => current.filter((other) => other.key !== row.key))
                    }
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setRows((current) => [...current, newRow()])}
          >
            <IconPlus size={18} />
            {t('group.addOption')}
          </button>
        </fieldset>
      </form>
    </Drawer>
  );
}
