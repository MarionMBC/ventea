import { MAX_CANCEL_WINDOW_MINUTES, orderSettingsSchema, type OrderSettings } from '@ventea/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';

import { useApi } from '@/app/services';
import { TENANT_QUERY_KEY } from '@/app/tenant';
import { describeError, useI18n } from '@/i18n';
import { IconClock } from '@/ui/icons';

const ORDER_SETTINGS_KEY = ['staff-order-settings'] as const;

function useOrderSettings() {
  const client = useApi();
  return useQuery({
    queryKey: ORDER_SETTINGS_KEY,
    queryFn: ({ signal }) =>
      client.request<OrderSettings>('/staff/order-settings', {
        schema: orderSettingsSchema,
        signal,
      }),
  });
}

function useSaveOrderSettings() {
  const client = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderSettings) =>
      client.request<OrderSettings>('/staff/order-settings', {
        method: 'PUT',
        body: input,
        schema: orderSettingsSchema,
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(ORDER_SETTINGS_KEY, data);
      await queryClient.invalidateQueries({ queryKey: TENANT_QUERY_KEY });
    },
  });
}

/** Minutos escritos → número entero, `null` (vacío = sin límite) o `undefined` si no vale. */
export function parseWindow(text: string): number | null | undefined {
  const value = text.trim();
  if (value === '') return null;
  if (!/^\d{1,4}$/.test(value)) return undefined;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= MAX_CANCEL_WINDOW_MINUTES ? minutes : undefined;
}

/** Cancelación del pedido por el cliente desde la app: interruptor y tiempo de gracia. */
export function OrderSettingsCard() {
  const i18n = useI18n();
  const { t } = i18n;
  const id = useId();
  const settings = useOrderSettings();
  const save = useSaveOrderSettings();
  const [draft, setDraft] = useState<{ enabled: boolean; minutes: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  if (settings.isPending) return null;
  if (!settings.data) {
    return (
      <p className="banner banner--warn" role="alert">
        {describeError(settings.error, i18n)}
      </p>
    );
  }

  const saved = {
    enabled: settings.data.enabled,
    minutes: settings.data.windowMinutes === null ? '' : String(settings.data.windowMinutes),
  };
  const current = draft ?? saved;
  const dirty = current.enabled !== saved.enabled || current.minutes.trim() !== saved.minutes;

  const change = (next: { enabled: boolean; minutes: string }) => {
    setDraft(next);
    setInvalid(false);
    setFlash(null);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || save.isPending) return;
    const windowMinutes = parseWindow(current.minutes);
    if (windowMinutes === undefined) {
      setInvalid(true);
      return;
    }
    save.mutate(
      { enabled: current.enabled, windowMinutes },
      {
        onSuccess: () => {
          setDraft(null);
          setFlash(t('orderSettings.saved'));
        },
      },
    );
  };

  return (
    <form className="card" aria-labelledby={`${id}-title`} onSubmit={onSubmit} noValidate>
      <div className="card__head">
        <span className="card__icon" aria-hidden="true">
          <IconClock size={20} />
        </span>
        <h2 id={`${id}-title`}>{t('orderSettings.title')}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={current.enabled}
          aria-label={t('orderSettings.enabledAria')}
          className="switch"
          disabled={save.isPending}
          onClick={() => change({ ...current, enabled: !current.enabled })}
        >
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span className="switch__text">
            {current.enabled ? t('rewards.on') : t('rewards.off')}
          </span>
        </button>
      </div>
      <p className="muted">{t('orderSettings.hint')}</p>
      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}
      {!current.enabled && <p className="banner banner--warn">{t('orderSettings.offHint')}</p>}

      <fieldset disabled={save.isPending || !current.enabled} style={{ border: 0, padding: 0 }}>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-minutes`}>
            {t('orderSettings.window')}
          </label>
          <input
            id={`${id}-minutes`}
            className="field__input"
            inputMode="numeric"
            autoComplete="off"
            value={current.minutes}
            aria-invalid={invalid}
            onChange={(event) => change({ ...current, minutes: event.target.value })}
          />
          <p className="field__hint">{t('orderSettings.windowHint')}</p>
          {invalid && (
            <p className="field__error">
              {t('orderSettings.windowError', { max: MAX_CANCEL_WINDOW_MINUTES })}
            </p>
          )}
        </div>
      </fieldset>

      {save.error && (
        <p className="form-error" role="alert">
          {describeError(save.error, i18n)}
        </p>
      )}
      <div className={`savebar${dirty ? ' is-dirty' : ''}`}>
        <span className="savebar__text" role="status">
          {dirty ? t('rewards.unsaved') : t('rewards.allSaved')}
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => change(saved)}
          disabled={!dirty || save.isPending}
        >
          {t('rewards.discard')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={!dirty || save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
