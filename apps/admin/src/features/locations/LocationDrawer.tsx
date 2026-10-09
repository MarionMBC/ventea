import type { CreateLocationInput, StaffLocation, UpdateLocationInput } from '@ventea/shared';
import { useId, useState, type FormEvent } from 'react';

import { ConfirmDialog } from '@/features/platform/ConfirmDialog';
import { describeError, useI18n } from '@/i18n';
import { Drawer } from '@/ui/Drawer';
import { IconTrash } from '@/ui/icons';

import { useDeleteLocation, useSaveLocation } from './api';
import {
  sameRanges,
  sameTimeDays,
  WEEK,
  weekDraft,
  weekRanges,
  type Day,
  type WeekDraft,
} from './hours';

const PHONE = /^[+\d][\d\s().-]{4,}$/;

interface Draft {
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  acceptsOrders: boolean;
  week: WeekDraft;
}

function draftOf(location: StaffLocation | null, activeByDefault: boolean): Draft {
  return {
    name: location?.name ?? '',
    address: location?.address ?? '',
    phone: location?.phone ?? '',
    isActive: location?.isActive ?? activeByDefault,
    acceptsOrders: location?.acceptsOrders ?? true,
    week: weekDraft(location?.openingHours ?? []),
  };
}

/** Lo que cambió respecto de lo guardado (`PATCH`); en una sucursal nueva, todo (`POST`). */
export function locationBody(
  location: StaffLocation | null,
  draft: Draft,
): CreateLocationInput | UpdateLocationInput {
  const full = {
    name: draft.name.trim(),
    address: draft.address.trim(),
    phone: draft.phone.trim() || null,
    isActive: draft.isActive,
    acceptsOrders: draft.acceptsOrders,
    openingHours: weekRanges(draft.week),
  };
  if (!location) return full as CreateLocationInput;
  const patch: UpdateLocationInput = {};
  if (full.name !== location.name) patch.name = full.name;
  if (full.address !== location.address) patch.address = full.address;
  if (full.phone !== location.phone) patch.phone = full.phone;
  if (full.isActive !== location.isActive) patch.isActive = full.isActive;
  if (full.acceptsOrders !== location.acceptsOrders) patch.acceptsOrders = full.acceptsOrders;
  if (!sameRanges(full.openingHours, location.openingHours)) patch.openingHours = full.openingHours;
  return patch;
}

function Switch({
  checked,
  onChange,
  on,
  off,
  describedBy,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  on: string;
  off: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__text">{checked ? on : off}</span>
    </button>
  );
}

/**
 * Alta y edición de una sucursal (owner y manager): datos, estado, si recibe pedidos y el
 * horario por día. Borrar solo si no tiene pedidos (la API responde 409 si no).
 */
export function LocationDrawer({
  location,
  activeByDefault,
  onClose,
  onDone,
}: {
  /** `null` = sucursal nueva. */
  location: StaffLocation | null;
  /** Nueva sucursal: activa si el plan tiene lugar (si no, nace inactiva y no topa el límite). */
  activeByDefault: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const id = useId();
  const save = useSaveLocation();
  const remove = useDeleteLocation();
  const [draft, setDraft] = useState(() => draftOf(location, activeByDefault));
  const [errors, setErrors] = useState<Partial<Record<'name' | 'address' | 'phone', string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = save.isPending || remove.isPending;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (key === 'name' || key === 'address' || key === 'phone') {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };
  const setDay = (day: Day, patch: Partial<WeekDraft[Day]>) =>
    setDraft((prev) => ({
      ...prev,
      week: { ...prev.week, [day]: { ...prev.week[day], ...patch } },
    }));

  const badDays = sameTimeDays(draft.week);
  const body = locationBody(location, draft);
  const dirty = location === null || Object.keys(body).length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    if (!draft.name.trim()) found.name = t('locations.required');
    if (!draft.address.trim()) found.address = t('locations.required');
    if (draft.phone.trim() && !PHONE.test(draft.phone.trim()))
      found.phone = t('locations.phoneInvalid');
    setErrors(found);
    if (Object.keys(found).length > 0 || badDays.length > 0) return;
    save.mutate(
      { id: location?.id, body },
      { onSuccess: () => onDone(t(location ? 'locations.saved' : 'locations.created')) },
    );
  };

  const fieldError = (key: keyof typeof errors) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} className="field__error">
        {errors[key]}
      </p>
    ) : null;

  return (
    <>
      <Drawer
        title={location ? t('locations.editTitle') : t('locations.newTitle')}
        subtitle={location?.name}
        busy={busy}
        onClose={onClose}
        footer={
          <>
            {location && (
              <button
                type="button"
                className="btn btn--ghost btn--danger-text loc-form__delete"
                disabled={busy || location.hasOrders}
                aria-describedby={location.hasOrders ? `${id}-has-orders` : undefined}
                onClick={() => setConfirmDelete(true)}
              >
                <IconTrash size={18} />
                {t('locations.delete')}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form={`${id}-form`}
              className="btn btn--primary"
              disabled={busy || !dirty}
            >
              {save.isPending ? t('common.saving') : t('locations.save')}
            </button>
          </>
        }
      >
        <form id={`${id}-form`} className="form-grid" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-name`}>
              {t('locations.name')}
            </label>
            <input
              id={`${id}-name`}
              data-autofocus
              className="field__input"
              value={draft.name}
              maxLength={80}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${id}-name-error` : undefined}
              onChange={(event) => set('name', event.target.value)}
            />
            {fieldError('name')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-address`}>
              {t('locations.address')}
            </label>
            <input
              id={`${id}-address`}
              className="field__input"
              value={draft.address}
              maxLength={200}
              autoComplete="street-address"
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? `${id}-address-error` : undefined}
              onChange={(event) => set('address', event.target.value)}
            />
            {fieldError('address')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-phone`}>
              {t('locations.phone')} <span className="field__optional">{t('common.optional')}</span>
            </label>
            <input
              id={`${id}-phone`}
              className="field__input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={draft.phone}
              maxLength={30}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? `${id}-phone-error` : undefined}
              onChange={(event) => set('phone', event.target.value)}
            />
            {fieldError('phone')}
          </div>

          <fieldset className="fieldset">
            <legend className="field__label">{t('locations.status')}</legend>
            <div className="loc-form__switch">
              <Switch
                checked={draft.isActive}
                onChange={(value) => set('isActive', value)}
                on={t('locations.active')}
                off={t('locations.inactive')}
                describedBy={`${id}-active-hint`}
              />
              <p id={`${id}-active-hint`} className="field__hint">
                {t('locations.activeHint')}
              </p>
            </div>
            <div className="loc-form__switch">
              <Switch
                checked={draft.acceptsOrders}
                onChange={(value) => set('acceptsOrders', value)}
                on={t('locations.takingOrders')}
                off={t('locations.notTakingOrders')}
                describedBy={`${id}-orders-hint`}
              />
              <p id={`${id}-orders-hint`} className="field__hint">
                {t('locations.ordersHint')}
              </p>
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="field__label">{t('locations.hours')}</legend>
            <p className="field__hint">{t('locations.hoursHint')}</p>
            <ul className="hours-form">
              {WEEK.map((day) => {
                const value = draft.week[day];
                const dayName = t(`days.${day}`);
                const invalid = badDays.includes(day);
                return (
                  <li key={day} className={`hours-form__row${value.open ? '' : ' is-closed'}`}>
                    <label className="hours-form__day">
                      <input
                        type="checkbox"
                        checked={value.open}
                        aria-label={t('locations.dayOpenAria', { day: dayName })}
                        onChange={(event) => setDay(day, { open: event.target.checked })}
                      />
                      <span aria-hidden="true">{dayName}</span>
                    </label>
                    {value.open ? (
                      <span className="hours-form__times">
                        <input
                          type="time"
                          className="field__input"
                          value={value.opens}
                          required
                          aria-label={t('locations.opensAria', { day: dayName })}
                          aria-invalid={invalid}
                          onChange={(event) => setDay(day, { opens: event.target.value })}
                        />
                        <span aria-hidden="true">–</span>
                        <input
                          type="time"
                          className="field__input"
                          value={value.closes}
                          required
                          aria-label={t('locations.closesAria', { day: dayName })}
                          aria-invalid={invalid}
                          onChange={(event) => setDay(day, { closes: event.target.value })}
                        />
                      </span>
                    ) : (
                      <span className="hours-form__closed">{t('locations.closed')}</span>
                    )}
                    {invalid && (
                      <p className="field__error hours-form__error">{t('locations.sameTime')}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {location?.hasOrders && (
            <p id={`${id}-has-orders`} className="field__hint">
              {t('locations.hasOrders')}
            </p>
          )}
          {(save.error || remove.error) && (
            <p className="form-error" role="alert">
              {describeError(save.error ?? remove.error, i18n)}
            </p>
          )}
        </form>
      </Drawer>

      {confirmDelete && location && (
        <ConfirmDialog
          title={t('locations.deleteTitle', { name: location.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          pendingLabel={t('common.deleting')}
          danger
          pending={remove.isPending}
          error={remove.error ? describeError(remove.error, i18n) : undefined}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            remove.mutate(location.id, { onSuccess: () => onDone(t('locations.deleted')) })
          }
        >
          <p>{t('locations.deleteBody')}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
