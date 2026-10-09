import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BILLING_INTERVAL,
  planSchema,
  type BillingInterval,
  type Plan,
  type PlanCode,
} from '@ventea/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useApi, useSession } from '@/app/services';
import { ConfirmDialog } from '@/features/platform/ConfirmDialog';
import { describeError, useI18n, type I18n } from '@/i18n';
import { panelBillingOverviewSchema, type PanelBillingOverview } from '@/lib/billing-schemas';
import { IconAlert, IconBilling, IconHistory, IconStar } from '@/ui/icons';

import {
  BILLING_CONTACT_EMAIL,
  BILLING_QUERY_KEY,
  StatusBanner,
  useBillingOverview,
} from './SubscriptionBanner';

export { BILLING_CONTACT_EMAIL, BILLING_QUERY_KEY };

const plansSchema = {
  parse: (data: unknown): Plan[] =>
    Array.isArray(data) ? data.map((plan) => planSchema.parse(plan)) : [],
};

type Action = 'change-plan' | 'cancel' | 'resume';

/** Insignia del estado de la suscripción (mismos colores que la de plataforma, traducida). */
function SubscriptionBadge({ status }: { status: PanelBillingOverview['status'] | undefined }) {
  const { t } = useI18n();
  return (
    <span className={`pf-badge pf-badge--${status ?? 'none'}`}>
      {t(status ? `subscription.${status}` : 'subscription.none')}
    </span>
  );
}

/** `visa ••••4242`, o «Sin tarjeta». La API nunca expone más datos de la tarjeta. */
function cardText(card: PanelBillingOverview['card'], t: I18n['t']): string {
  if (!card) return t('billing.noCard');
  return [card.brand ?? t('billing.card'), card.last4 ? `••••${card.last4}` : null]
    .filter(Boolean)
    .join(' ');
}

const contactLink = <a href={`mailto:${BILLING_CONTACT_EMAIL}`}>{BILLING_CONTACT_EMAIL}</a>;

/**
 * Facturación de la marca (`GET /api/billing`), solo para el dueño: la API responde 403
 * a manager y staff, y el panel ni siquiera muestra la sección. Funciona con la marca
 * suspendida: las rutas de billing quedan abiertas para que el dueño pueda regularizar.
 */
export function BillingPage() {
  const session = useSession();
  const client = useApi();
  const queryClient = useQueryClient();
  const i18n = useI18n();
  const { t, rich, day, dateTime, money } = i18n;
  const [dialog, setDialog] = useState<Action | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    document.title = t('billing.pageTitle');
  }, [t]);

  const billing = useBillingOverview();

  const action = useMutation({
    mutationFn: (input: { kind: Action; body?: unknown }) =>
      client.request<PanelBillingOverview>(`/billing/${input.kind}`, {
        method: 'POST',
        body: input.body,
        schema: panelBillingOverviewSchema,
      }),
    onSuccess: (overview) => queryClient.setQueryData(BILLING_QUERY_KEY, overview),
  });

  if (session && session.staff.role !== 'owner') return <Navigate to="/orders" replace />;

  if (billing.error) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('billing.errorTitle')}</h1>
        <p>{describeError(billing.error, i18n)}</p>
      </div>
    );
  }
  if (!billing.data) {
    return (
      <div className="page" role="status">
        <span className="sr-only">{t('billing.loading')}</span>
        <div className="page-grid" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="card card--skeleton">
              <span className="skeleton" style={{ width: '40%', height: 22 }} />
              <span className="skeleton" style={{ width: '90%', height: 14 }} />
              <span className="skeleton" style={{ width: '75%', height: 14 }} />
              <span className="skeleton" style={{ width: '60%', height: 14 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const data = billing.data;
  const open = (kind: Action) => {
    action.reset();
    setDone(null);
    setDialog(kind);
  };
  const run = (kind: Action, body: unknown, message: string) =>
    action.mutate(
      { kind, body },
      {
        onSuccess: () => {
          setDialog(null);
          setDone(message);
        },
      },
    );
  const periodEnd = day(data.currentPeriodEnd);
  const per = data.interval === 'year' ? t('billing.perYear') : t('billing.perMonth');
  const actionError = action.error ? describeError(action.error, i18n) : undefined;
  const dialogLabels = {
    cancelLabel: t('billing.dialogBack'),
    pendingLabel: t('billing.applying'),
  };

  return (
    <section className="page billing" aria-labelledby="billing-title">
      <header className="page-head">
        <div className="page-head__text">
          <h1 id="billing-title" className="page-head__title">
            {t('billing.title')}
          </h1>
          <p className="page-head__sub">{t('billing.subtitle')}</p>
        </div>
        <SubscriptionBadge status={data.status} />
      </header>

      <StatusBanner data={data} />

      {done && (
        <p className="flash" role="status">
          {done}
        </p>
      )}

      <div className="page-grid">
        <article className="card" aria-labelledby="billing-plan">
          <div className="card__head">
            <span className="card__icon" aria-hidden="true">
              <IconStar size={20} />
            </span>
            <h2 id="billing-plan">{t('billing.yourPlan')}</h2>
          </div>
          <dl className="facts">
            <Fact label={t('billing.plan')}>
              {data.planName} {t(`interval.${data.interval}`)}
            </Fact>
            <Fact label={t('billing.price')}>
              {money(data.price.amountCents, data.price.currency)} {data.price.currency} / {per}
            </Fact>
            <Fact label={t('billing.status')}>
              <SubscriptionBadge status={data.status} />
            </Fact>
            {data.status === 'trialing' && data.trialEndsAt && (
              <Fact label={t('billing.trialUntil')}>{day(data.trialEndsAt)}</Fact>
            )}
            <Fact label={t('billing.currentPeriod')}>
              {day(data.currentPeriodStart)} – {periodEnd}
            </Fact>
            {data.retryAt && <Fact label={t('billing.nextRetry')}>{day(data.retryAt)}</Fact>}
            {data.pendingPlan && (
              <Fact label={t('billing.scheduledChange')}>
                {t('billing.scheduledChangeValue', {
                  plan: t(`plan.${data.pendingPlan.planCode}`),
                  interval: t(`interval.${data.pendingPlan.interval}`),
                  date: periodEnd,
                })}
              </Fact>
            )}
            <Fact label={t('billing.renewal')}>
              {data.cancelAtPeriodEnd
                ? t('billing.cancelsOn', { date: periodEnd })
                : t('billing.automatic')}
            </Fact>
          </dl>
          <div className="card__actions" role="group" aria-label={t('billing.planActions')}>
            <button type="button" className="btn btn--ghost" onClick={() => open('change-plan')}>
              {t('billing.changePlan')}
            </button>
            {data.cancelAtPeriodEnd ? (
              <button type="button" className="btn btn--primary" onClick={() => open('resume')}>
                {t('billing.resume')}
              </button>
            ) : (
              data.status !== 'canceled' && (
                <button
                  type="button"
                  className="btn btn--quiet btn--danger-text"
                  onClick={() => open('cancel')}
                >
                  {t('billing.cancel')}
                </button>
              )
            )}
          </div>
        </article>

        <article className="card" aria-labelledby="billing-card">
          <div className="card__head">
            <span className="card__icon" aria-hidden="true">
              <IconBilling size={20} />
            </span>
            <h2 id="billing-card">{t('billing.paymentMethod')}</h2>
          </div>
          <dl className="facts">
            <Fact label={t('billing.card')}>{cardText(data.card, t)}</Fact>
          </dl>
          <p className="card__note">{rich('billing.paymentNote', { email: contactLink })}</p>
          {data.mode !== 'manual' && <p className="muted">{t('billing.cardSoon')}</p>}
        </article>
      </div>

      <article className="card" aria-labelledby="billing-events">
        <div className="card__head">
          <span className="card__icon" aria-hidden="true">
            <IconHistory size={20} />
          </span>
          <h2 id="billing-events">{t('billing.events')}</h2>
        </div>
        {data.events.length === 0 ? (
          <p className="muted">{t('billing.noEvents')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">{t('billing.eventsCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('billing.colDate')}</th>
                  <th scope="col">{t('billing.colEvent')}</th>
                  <th scope="col" className="num">
                    {t('billing.colAmount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event, index) => (
                  <tr key={`${event.createdAt.toISOString()}-${index}`}>
                    <td className="nowrap">{dateTime(event.createdAt)}</td>
                    {/* La descripción la escribe el servidor (hoy, en español). */}
                    <td>{event.description}</td>
                    <td className="num">
                      {event.amountCents === null
                        ? '—'
                        : money(event.amountCents, data.price.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {dialog === 'change-plan' && (
        <ChangePlanDialog
          current={{ planCode: data.planCode, interval: data.interval }}
          periodEnd={periodEnd}
          pending={action.isPending}
          error={actionError}
          onCancel={() => setDialog(null)}
          onConfirm={(planCode, interval) =>
            run('change-plan', { planCode, interval }, t('billing.changeDone', { date: periodEnd }))
          }
        />
      )}
      {dialog === 'cancel' && (
        <ConfirmDialog
          {...dialogLabels}
          title={t('billing.cancelTitle')}
          confirmLabel={t('billing.cancelConfirm')}
          danger
          pending={action.isPending}
          error={actionError}
          onCancel={() => setDialog(null)}
          onConfirm={() => run('cancel', undefined, t('billing.cancelDone', { date: periodEnd }))}
        >
          <p>{rich('billing.cancelBody', { date: <strong>{periodEnd}</strong> })}</p>
        </ConfirmDialog>
      )}
      {dialog === 'resume' && (
        <ConfirmDialog
          {...dialogLabels}
          title={t('billing.resumeTitle')}
          confirmLabel={t('billing.resumeConfirm')}
          pending={action.isPending}
          error={actionError}
          onCancel={() => setDialog(null)}
          onConfirm={() => run('resume', undefined, t('billing.resumeDone'))}
        >
          <p>{t('billing.resumeBody', { date: periodEnd })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ChangePlanDialog({
  current,
  periodEnd,
  onConfirm,
  ...props
}: {
  current: { planCode: PlanCode; interval: BillingInterval };
  periodEnd: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (planCode: PlanCode, interval: BillingInterval) => void;
}) {
  const client = useApi();
  const { t, money } = useI18n();
  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) =>
      client.request<Plan[]>('/platform/plans', { auth: false, schema: plansSchema, signal }),
    staleTime: 10 * 60_000,
  });
  const [planCode, setPlanCode] = useState<PlanCode>(current.planCode);
  const [interval, setBillingInterval] = useState<BillingInterval>(current.interval);
  const unchanged = planCode === current.planCode && interval === current.interval;
  const price = plans.data?.find((p) => p.code === planCode);

  return (
    <ConfirmDialog
      {...props}
      cancelLabel={t('billing.dialogBack')}
      pendingLabel={t('billing.applying')}
      title={t('billing.changeTitle')}
      confirmLabel={t('billing.changeConfirm')}
      onConfirm={() => (unchanged ? props.onCancel() : onConfirm(planCode, interval))}
    >
      <label className="field">
        <span className="field__label">{t('billing.plan')}</span>
        <select
          className="field__input"
          value={planCode}
          onChange={(event) => setPlanCode(event.target.value as PlanCode)}
        >
          {(plans.data ?? []).map((plan) => (
            <option key={plan.code} value={plan.code}>
              {plan.name}
            </option>
          ))}
          {!plans.data && <option value={current.planCode}>{t(`plan.${current.planCode}`)}</option>}
        </select>
      </label>
      <label className="field">
        <span className="field__label">{t('billing.cycle')}</span>
        <select
          className="field__input"
          value={interval}
          onChange={(event) => setBillingInterval(event.target.value as BillingInterval)}
        >
          {BILLING_INTERVAL.map((value) => (
            <option key={value} value={value}>
              {value === 'year' ? t('billing.yearlyOption') : t('billing.monthlyOption')}
            </option>
          ))}
        </select>
      </label>
      {price && (
        <p>
          {t('billing.newPrice')}{' '}
          <strong>
            {money(
              interval === 'year' ? price.priceYearlyCents : price.priceMonthlyCents,
              price.currency,
            )}{' '}
            {price.currency} / {interval === 'year' ? t('billing.perYear') : t('billing.perMonth')}
          </strong>
        </p>
      )}
      <p className="muted">{t('billing.changeNote', { date: periodEnd })}</p>
    </ConfirmDialog>
  );
}
