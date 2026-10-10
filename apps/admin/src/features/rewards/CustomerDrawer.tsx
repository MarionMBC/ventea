import type { RewardCatalogItem, RewardCustomer, RewardLedgerReason } from '@ventea/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { describeError, useI18n, type TKey } from '@/i18n';
import { Drawer } from '@/ui/Drawer';

import { actionKeys, useAdjustPoints, useRedeemReward, useRewardCustomer } from './api';

const REASON: Record<RewardLedgerReason, TKey> = {
  order_earned: 'rewards.reason.order_earned',
  redemption: 'rewards.reason.redemption',
  manual_adjustment: 'rewards.reason.manual_adjustment',
  expiration: 'rewards.reason.expiration',
  signup_bonus: 'rewards.reason.signup_bonus',
};

export function customerLabel(customer: Pick<RewardCustomer, 'firstName' | 'lastName' | 'email'>) {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  return name || customer.email;
}

/**
 * Puntos de un cliente: saldo, ajuste manual con motivo, canje de una recompensa del catálogo e
 * historial con quién hizo cada movimiento.
 */
export function CustomerDrawer({
  customer,
  rewards,
  programEnabled,
  onClose,
}: {
  customer: RewardCustomer;
  rewards: readonly RewardCatalogItem[];
  programEnabled: boolean;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t, dateTime } = i18n;
  const id = useId();
  const detail = useRewardCustomer(customer.id);
  const adjust = useAdjustPoints(customer.id);
  const redeem = useRedeemReward(customer.id);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ points?: string; reason?: string }>({});
  const [rewardId, setRewardId] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const current = detail.data?.customer ?? customer;
  const busy = adjust.isPending || redeem.isPending;
  const content = useRef<HTMLDivElement>(null);
  const [adjustKeys] = useState(() => actionKeys(`adjust:${customer.id}`));
  const [redeemKeys] = useState(() => actionKeys(`redeem:${customer.id}`));

  // Mientras guarda, el botón pulsado se deshabilita y el foco cae al <body>: al terminar se
  // devuelve al panel (si no, Escape y el ciclo de Tab dejan de funcionar en el cajón).
  useEffect(() => {
    if (!busy && document.activeElement === document.body) content.current?.focus();
  }, [busy]);
  const redeemable = rewards.filter(
    (reward) => reward.isActive && (reward.kind === 'discount' || reward.menuItemName !== null),
  );
  const selected = redeemable.find((reward) => reward.id === rewardId) ?? null;

  const onAdjust = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    const amount = /^\d{1,7}$/.test(points.trim()) ? Number(points.trim()) : 0;
    if (amount < 1) found.points = t('rewards.pointsInvalid');
    else if (direction === 'remove' && amount > current.balance) {
      found.points = t('rewards.notEnough', { balance: current.balance });
    }
    if (reason.trim().length < 3) found.reason = t('rewards.reasonRequired');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFlash(null);
    redeem.reset();
    const body = { points: direction === 'add' ? amount : -amount, reason: reason.trim() };
    adjust.mutate(
      { body, key: adjustKeys.keyFor([customer.id, body]) },
      {
        onSuccess: () => {
          setPoints('');
          setReason('');
          setFlash(t('rewards.adjusted'));
        },
      },
    );
  };

  const onRedeem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !selected) return;
    setFlash(null);
    adjust.reset();
    const body = { rewardId: selected.id };
    redeem.mutate(
      { body, key: redeemKeys.keyFor([customer.id, body]) },
      {
        onSuccess: () => {
          setRewardId('');
          setFlash(t('rewards.redeemed', { name: selected.name }));
        },
      },
    );
  };

  const rewardLabel = (reward: RewardCatalogItem) =>
    `${reward.name} · ${t('rewards.points', { count: reward.pointsCost })}`;

  return (
    <Drawer title={customerLabel(current)} subtitle={current.email} busy={busy} onClose={onClose}>
      <div className="rw-customer" ref={content} tabIndex={-1}>
        <dl className="stats rw-customer__stats">
          <div className="stat">
            <dt>{t('rewards.balance')}</dt>
            <dd>{current.balance}</dd>
          </div>
          <div className="stat">
            <dt>{t('rewards.lifetime')}</dt>
            <dd>{current.lifetimeEarned}</dd>
          </div>
        </dl>

        {flash && (
          <p className="flash" role="status">
            {flash}
          </p>
        )}

        <form
          className="rw-section form-grid"
          onSubmit={onAdjust}
          noValidate
          aria-labelledby={`${id}-adjust`}
        >
          <h3 id={`${id}-adjust`} className="rw-section__title">
            {t('rewards.adjust')}
          </h3>
          <fieldset className="rw-kind" disabled={busy}>
            <legend className="sr-only">{t('rewards.adjustDirection')}</legend>
            <div className="segmented rw-kind__options">
              {(['add', 'remove'] as const).map((value) => (
                <label
                  key={value}
                  className={`segmented__item rw-kind__option${direction === value ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${id}-direction`}
                    value={value}
                    checked={direction === value}
                    onChange={() => setDirection(value)}
                  />
                  {value === 'add' ? t('rewards.adjustAdd') : t('rewards.adjustRemove')}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-points`}>
              {t('rewards.adjustPoints')}
            </label>
            <input
              id={`${id}-points`}
              className="field__input"
              inputMode="numeric"
              autoComplete="off"
              value={points}
              disabled={busy}
              aria-invalid={!!errors.points}
              aria-describedby={errors.points ? `${id}-points-error` : undefined}
              onChange={(event) => {
                setPoints(event.target.value);
                setErrors((e) => ({ ...e, points: undefined }));
              }}
            />
            {errors.points && (
              <p id={`${id}-points-error`} className="field__error">
                {errors.points}
              </p>
            )}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-reason`}>
              {t('rewards.adjustReason')}
            </label>
            <input
              id={`${id}-reason`}
              className="field__input"
              maxLength={200}
              value={reason}
              disabled={busy}
              aria-invalid={!!errors.reason}
              aria-describedby={[`${id}-reason-hint`, errors.reason ? `${id}-reason-error` : '']
                .filter(Boolean)
                .join(' ')}
              onChange={(event) => {
                setReason(event.target.value);
                setErrors((e) => ({ ...e, reason: undefined }));
              }}
            />
            <p id={`${id}-reason-hint`} className="field__hint">
              {t('rewards.adjustReasonHint')}
            </p>
            {errors.reason && (
              <p id={`${id}-reason-error`} className="field__error">
                {errors.reason}
              </p>
            )}
          </div>
          {adjust.error && (
            <p className="form-error" role="alert">
              {describeError(adjust.error, i18n)}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {adjust.isPending ? t('common.saving') : t('rewards.adjustSubmit')}
          </button>
        </form>

        <form className="rw-section form-grid" onSubmit={onRedeem} aria-labelledby={`${id}-redeem`}>
          <h3 id={`${id}-redeem`} className="rw-section__title">
            {t('rewards.redeem')}
          </h3>
          {!programEnabled ? (
            <p className="muted">{t('rewards.programOff')}</p>
          ) : redeemable.length === 0 ? (
            <p className="muted">{t('rewards.noRewards')}</p>
          ) : (
            <>
              <div className="field">
                <label className="field__label" htmlFor={`${id}-reward`}>
                  {t('rewards.chooseReward')}
                </label>
                <select
                  id={`${id}-reward`}
                  className="field__input"
                  value={rewardId}
                  disabled={busy}
                  aria-describedby={`${id}-reward-hint`}
                  onChange={(event) => setRewardId(event.target.value)}
                >
                  <option value="">—</option>
                  {redeemable.map((reward) => (
                    <option
                      key={reward.id}
                      value={reward.id}
                      disabled={reward.pointsCost > current.balance}
                    >
                      {rewardLabel(reward)}
                    </option>
                  ))}
                </select>
                <p id={`${id}-reward-hint`} className="field__hint">
                  {t('rewards.redeemHint')}
                </p>
              </div>
              {redeem.error && (
                <p className="form-error" role="alert">
                  {describeError(redeem.error, i18n)}
                </p>
              )}
              <button
                type="submit"
                className="btn btn--ghost"
                disabled={busy || !selected || selected.pointsCost > current.balance}
              >
                {redeem.isPending ? t('common.saving') : t('rewards.redeemSubmit')}
              </button>
            </>
          )}
        </form>

        <section className="rw-section" aria-labelledby={`${id}-history`}>
          <h3 id={`${id}-history`} className="rw-section__title">
            {t('rewards.history')}
          </h3>
          {detail.error && !detail.data ? (
            <p className="form-error" role="alert">
              {describeError(detail.error, i18n)}
            </p>
          ) : !detail.data ? (
            <p className="muted" role="status">
              {t('rewards.loading')}
            </p>
          ) : detail.data.entries.length === 0 ? (
            <p className="muted">{t('rewards.historyEmpty')}</p>
          ) : (
            <>
              <ol className="rw-ledger">
                {detail.data.entries.map((entry) => (
                  <li key={entry.id} className="rw-ledger__row">
                    <span className="rw-ledger__what">
                      <span className="rw-ledger__reason">
                        {t(REASON[entry.reason])}
                        {entry.rewardName && ` · ${entry.rewardName}`}
                        {entry.orderCode && ` · ${t('rewards.order', { code: entry.orderCode })}`}
                      </span>
                      {entry.staffNote && (
                        <span className="rw-ledger__note">{entry.staffNote}</span>
                      )}
                      <span className="rw-ledger__meta">
                        <time dateTime={entry.createdAt.toISOString()}>
                          {dateTime(entry.createdAt)}
                        </time>
                        {entry.staffName && ` · ${t('rewards.by', { name: entry.staffName })}`}
                      </span>
                    </span>
                    <span
                      className={`rw-ledger__points${entry.points > 0 ? ' is-credit' : ' is-debit'}`}
                    >
                      {entry.points > 0 ? `+${entry.points}` : entry.points}
                    </span>
                  </li>
                ))}
              </ol>
              {detail.data.entries.length >= 50 && (
                <p className="field__hint">{t('rewards.historyNote')}</p>
              )}
            </>
          )}
        </section>
      </div>
    </Drawer>
  );
}
