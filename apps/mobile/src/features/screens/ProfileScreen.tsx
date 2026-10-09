import { useEffect } from 'react';
import { getMe, getRewardBalance, getRewardLedger, getTenant } from '../../api/endpoints';
import type { RewardLedgerReason } from '../../api/types';
import { useBrand } from '../../brand/useBrand';
import { ProfileMenu } from '../../components/navigation/ProfileMenu';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { Skeleton } from '../../components/ui/Skeleton';
import { BackHeader } from '../../components/navigation/AppHeader';
import { formatDate, t } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { useAuth } from '../auth/authContext';
import { useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';
import { RetryState, SignInState } from './ScreenStates';
import './screens.css';

export interface ProfileScreenProps {
  onBack?: () => void;
  onOpenFavourites?: () => void;
  onOpenOrders?: () => void;
  onSignIn?: () => void;
  /** Called after the session is cleared. */
  onSignedOut?: () => void;
}

const LEDGER_PREVIEW = 5;

const reasonKeys: Record<RewardLedgerReason, MessageKey> = {
  order_earned: 'points.reason.order',
  redemption: 'points.reason.redemption',
  manual_adjustment: 'points.reason.adjustment',
  expiration: 'points.reason.expiration',
  signup_bonus: 'points.reason.signup',
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
  onSignedOut,
}: ProfileScreenProps) => {
  const brand = useBrand();
  const { customer, isAuthenticated, signOut, updateCustomer } = useAuth();
  const me = useResource((signal) => getMe(signal), [], { enabled: isAuthenticated });
  const tenant = useResource((signal) => getTenant(signal), [], { enabled: isAuthenticated });
  const pointsEnabled = tenant.data?.rewardProgram.isEnabled === true;
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

        {pointsEnabled && (
          <section className="vt-section">
            <h2 className="vt-h3">{t('points.activity')}</h2>
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
                      <span>{t(reasonKeys[entry.reason] ?? 'points.reason.adjustment')}</span>
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
              id: 'logout',
              label: t('profile.signOut'),
              icon: 'logOutOutline',
              danger: true,
              onSelect: () => {
                signOut();
                onSignedOut?.();
              },
            },
          ]}
        />

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
