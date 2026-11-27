import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { getMe, getRewardBalance, getRewardLedger, getTenant } from '../../api/endpoints';
import type { RewardCatalogEntry, RewardLedgerEntry, RewardLedgerReason } from '../../api/types';
import { useBrand } from '../../brand/useBrand';
import { InlineAlert } from '../../components/feedback/InlineAlert';
import { ProfileMenu } from '../../components/navigation/ProfileMenu';
import { Button } from '../../components/ui/Button';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { formatPrice } from '../../components/ui/formatPrice';
import { Skeleton } from '../../components/ui/Skeleton';
import { BackHeader } from '../../components/navigation/AppHeader';
import { formatDate, intlLocale, t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { useAuth } from '../auth/authContext';
import { fromCents } from '../menu/pricing';
import { useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';
import { RetryState, SignInState } from './ScreenStates';
import './screens.css';

export interface ProfileScreenProps {
  onBack?: () => void;
  onOpenFavourites?: () => void;
  onOpenOrders?: () => void;
  onSignIn?: () => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  onOpenSupport?: () => void;
  /** Called after the session is cleared. */
  onSignedOut?: () => void;
  /** Called after the account is deleted and the session cleared. */
  onAccountDeleted?: () => void;
}

/** Account deletion (App Store 5.1.1(v)): asked inline, then one call to the API. */
type DeleteState =
  | { step: 'idle' }
  | { step: 'confirm'; error?: string }
  | { step: 'deleting' };

const LEDGER_PREVIEW = 5;

const reasonKeys: Record<RewardLedgerReason, MessageKey> = {
  order_earned: 'points.reason.order',
  redemption: 'points.reason.redemption',
  manual_adjustment: 'points.reason.adjustment',
  expiration: 'points.reason.expiration',
  signup_bonus: 'points.reason.signup',
};

/* A reward redeemed at the counter (TASK-023) has no order; its note is the reward's name. */
const entryLabel = (entry: RewardLedgerEntry): string =>
  entry.reason === 'redemption' && !entry.orderId && entry.note
    ? t('points.reason.reward', { name: entry.note })
    : t(reasonKeys[entry.reason] ?? 'points.reason.adjustment');

const rewardDetail = (reward: RewardCatalogEntry, balance: number | null): string => {
  const what =
    reward.kind === 'discount' && reward.discountCents
      ? t('rewards.discount', { amount: formatPrice(fromCents(reward.discountCents)) })
      : t('rewards.item');
  if (balance === null) return what;
  const missing = reward.pointsCost - balance;
  return `${what} · ${missing <= 0 ? t('rewards.ready') : t('rewards.toGo', { points: missing })}`;
};

/**
 * Tasa de puntos en palabras: «2.5 puntos por cada $1» o, por debajo de 1, «1 punto cada $2»
 * (nada de «0.5 puntos por cada $1»). Hasta 2 decimales, con el formato del idioma.
 */
export const earnRateText = (rate: number): string => {
  if (rate >= 1) {
    const points = new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(rate);
    return t('points.earnRate', { points, amount: formatPrice(1) });
  }
  return t('points.earnRateLow', { amount: formatPrice(1 / rate) });
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

/**
 * Account hub: who you are (`/api/me`), your points (`/api/rewards/*`) when
 * the brand runs a programme, then the settings list. There are no address
 * or payment entries: the platform has no delivery or online payment yet,
 * and the template never shows placeholders for features that do not exist.
 */
export const ProfileScreen = ({
  onBack,
  onOpenFavourites,
  onOpenOrders,
  onSignIn,
  onOpenPrivacy,
  onOpenTerms,
  onOpenSupport,
  onSignedOut,
  onAccountDeleted,
}: ProfileScreenProps) => {
  const brand = useBrand();
  const { customer, isAuthenticated, signOut, deleteAccount, updateCustomer } = useAuth();
  const [deletion, setDeletion] = useState<DeleteState>({ step: 'idle' });
  /* Sign-out waits for the API to forget this device (up to ~3 s): show it, and one tap only. */
  const [signingOut, setSigningOut] = useState(false);
  const me = useResource((signal) => getMe(signal), [], { enabled: isAuthenticated });
  const tenant = useResource((signal) => getTenant(signal), [], { enabled: isAuthenticated });
  const pointsEnabled = tenant.data?.rewardProgram.isEnabled === true;
  const rewards = pointsEnabled ? (tenant.data?.rewards ?? []) : [];
  const rate = tenant.data?.rewardProgram.pointsPerCurrencyUnit ?? 0;
  const balance = useResource((signal) => getRewardBalance(signal), [pointsEnabled], {
    enabled: isAuthenticated && pointsEnabled,
  });
  const ledger = useResource((signal) => getRewardLedger(signal), [pointsEnabled], {
    enabled: isAuthenticated && pointsEnabled,
  });

  /* Keep the cached customer in step with the API (name changed elsewhere). */
  useEffect(() => {
    if (me.data) updateCustomer(me.data);
  }, [me.data, updateCustomer]);

  const header = <BackHeader title={t('profile.title')} onBack={onBack} />;

  const confirmDelete = () => {
    if (deletion.step === 'deleting') return;
    setDeletion({ step: 'deleting' });
    deleteAccount()
      .then(() => onAccountDeleted?.())
      .catch((error: unknown) =>
        setDeletion({
          step: 'confirm',
          error:
            error instanceof ApiError && error.status === 409
              ? t('profile.delete.activeOrder')
              : t('profile.delete.error'),
        }),
      );
  };

  if (!isAuthenticated || !customer) {
    return (
      <ScreenShell header={header}>
        <div className="vt-screen__inner">
          <SignInState description={t('profile.signIn')} onSignIn={onSignIn} />
        </div>
      </ScreenShell>
    );
  }

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email;
  const entries = (ledger.data ?? []).slice(0, LEDGER_PREVIEW);

  return (
    <ScreenShell header={header}>
      <div className="vt-screen__inner">
        <div className="vt-profile-head">
          <span className="vt-profile-head__avatar" aria-hidden="true">
            {initials(name)}
          </span>
          <div className="vt-stack-1" style={{ flex: 1, minWidth: 0 }}>
            <span className="vt-title">{name}</span>
            <span className="vt-caption">{customer.email}</span>
          </div>
          {pointsEnabled && (
            <div className="vt-stack-1" style={{ textAlign: 'end' }}>
              {balance.data ? (
                <span className="vt-profile-head__points">{balance.data.balance}</span>
              ) : balance.error ? (
                <span className="vt-profile-head__points">—</span>
              ) : (
                <Skeleton width="48px" height="24px" />
              )}
              <span className="vt-caption">{t('points.unit')}</span>
            </div>
          )}
        </div>

        {rewards.length > 0 && (
          <section className="vt-section" aria-labelledby="vt-rewards-title">
            <h2 className="vt-h3" id="vt-rewards-title">
              {t('rewards.title')}
            </h2>
            <span className="vt-caption">{t('rewards.howTo')}</span>
            <ul className="vt-totals vt-rewards">
              {rewards.map((reward) => (
                <li key={reward.id} className="vt-totals__row">
                  <span className="vt-stack-1">
                    <span className="vt-rewards__name">{reward.name}</span>
                    <span className="vt-caption">
                      {rewardDetail(reward, balance.data?.balance ?? null)}
                    </span>
                  </span>
                  <span className="vt-text-brand vt-rewards__cost">
                    {t('rewards.cost', { points: reward.pointsCost })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pointsEnabled && (
          <section className="vt-section">
            <h2 className="vt-h3">{t('points.activity')}</h2>
            {rate > 0 && <span className="vt-caption">{earnRateText(rate)}</span>}
            {ledger.error && !ledger.data ? (
              <RetryState
                title={t('points.loadError')}
                message={ledger.error}
                onRetry={ledger.reload}
              />
            ) : ledger.loading ? (
              <div
                className="vt-stack-2"
                role="status"
                aria-busy="true"
                aria-label={t('a11y.loadingPoints')}
              >
                <Skeleton height="18px" />
                <Skeleton height="18px" />
              </div>
            ) : entries.length === 0 ? (
              <span className="vt-caption">{t('points.empty')}</span>
            ) : (
              <div className="vt-totals">
                {entries.map((entry) => (
                  <div key={entry.id} className="vt-totals__row">
                    <span className="vt-stack-1">
                      <span>{entryLabel(entry)}</span>
                      <span className="vt-caption">{formatDate(entry.createdAt, DATE_FORMAT)}</span>
                    </span>
                    <span className={entry.points > 0 ? 'vt-text-brand' : undefined}>
                      {entry.points > 0 ? `+${entry.points}` : entry.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <ProfileMenu
          entries={[
            {
              id: 'orders',
              label: t('profile.orders'),
              icon: 'receiptOutline',
              onSelect: onOpenOrders,
            },
            {
              id: 'favourites',
              label: t('favourites.title'),
              icon: 'heartOutline',
              onSelect: onOpenFavourites,
            },
            {
              id: 'privacy',
              label: t('profile.privacy'),
              icon: 'shieldCheckmarkOutline',
              onSelect: onOpenPrivacy,
            },
            {
              id: 'terms',
              label: t('profile.terms'),
              icon: 'documentTextOutline',
              onSelect: onOpenTerms,
            },
            {
              id: 'support',
              label: t('profile.support'),
              icon: 'helpCircleOutline',
              onSelect: onOpenSupport,
            },
            {
              id: 'logout',
              label: signingOut ? t('profile.signingOut') : t('profile.signOut'),
              icon: 'logOutOutline',
              danger: true,
              loading: signingOut,
              onSelect: () => {
                if (signingOut) return;
                setSigningOut(true);
                void signOut()
                  .then(() => onSignedOut?.())
                  .finally(() => setSigningOut(false));
              },
            },
            {
              id: 'delete',
              label: t('profile.delete'),
              icon: 'trashOutline',
              danger: true,
              onSelect: () => setDeletion({ step: 'confirm' }),
            },
          ]}
        />

        {deletion.step !== 'idle' && (
          <InlineAlert tone="danger" title={t('profile.delete.title')}>
            {t('profile.delete.description')}
            {deletion.step === 'confirm' && deletion.error && (
              <strong style={{ display: 'block', marginTop: 'var(--vt-space-2)' }}>
                {deletion.error}
              </strong>
            )}
            <span className="vt-row" style={{ marginTop: 'var(--vt-space-2)' }}>
              <Button
                variant="danger"
                size="sm"
                loading={deletion.step === 'deleting'}
                loadingLabel={t('profile.delete.deleting')}
                onClick={confirmDelete}
              >
                {t('profile.delete.confirm')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deletion.step === 'deleting'}
                onClick={() => setDeletion({ step: 'idle' })}
              >
                {t('common.cancel')}
              </Button>
            </span>
          </InlineAlert>
        )}

        <div
          className="vt-row"
          style={{ justifyContent: 'center', paddingTop: 'var(--vt-space-4)' }}
        >
          <BrandLogo size={40} labelled={false} />
          <span className="vt-caption">
            {brand.appName} · v{__APP_VERSION__}
          </span>
        </div>
      </div>
    </ScreenShell>
  );
};
