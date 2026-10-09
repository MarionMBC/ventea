import type { BillingInterval, Plan } from '@ventea/shared';

import { TRIAL_DAYS } from '@/config';
import { signupHref, useIntlLocale, useLocale, useT } from '@/i18n';
import { formatUsd, priceFor, yearlySavingsCents } from '@/lib/format';
import { planFeatures, planName, planTagline } from '@/lib/plans';
import type { PlansState } from '@/lib/usePlans';

import { IntervalToggle } from './IntervalToggle';

function PlanCard({ plan, interval }: { plan: Plan; interval: BillingInterval }) {
  const t = useT();
  const p = t.pricing;
  const locale = useLocale();
  const intl = useIntlLocale();
  const usd = (cents: number) => formatUsd(cents, intl);
  const featured = plan.code === 'pro';
  const price = priceFor(plan, interval);
  const savings = yearlySavingsCents(plan);
  const titleId = `plan-${plan.code}`;
  const name = planName(plan, t);

  return (
    <li className={`plan${featured ? ' plan--featured' : ''}`} aria-labelledby={titleId}>
      <div className="plan__head">
        <h3 className="plan__name" id={titleId}>
          {name}
        </h3>
        {featured && <p className="plan__badge">{p.recommended}</p>}
      </div>
      <p className="plan__tagline">{planTagline(plan.code, t)}</p>
      <p className="plan__price" data-testid={`price-${plan.code}`}>
        <span className="plan__amount">{usd(price)}</span>
        <span className="plan__per"> USD / {p.per[interval]}</span>
      </p>
      <p className="plan__note">
        {interval === 'year'
          ? p.yearlyNote(usd(Math.round(price / 12)), usd(savings))
          : p.monthlyNote(usd(plan.priceYearlyCents))}
      </p>
      <a
        className={`btn btn--block ${featured ? 'btn--sun' : 'btn--outline'}`}
        href={signupHref(locale, plan.code, interval)}
      >
        {p.cta(name)}
        <span className="sr-only">{p.ctaSuffix(TRIAL_DAYS)}</span>
      </a>
      <ul className="plan__features">
        {planFeatures(plan, t).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </li>
  );
}

/** Precios reales desde la API (`GET /api/platform/plans`), con el selector mensual/anual. */
export function Pricing({
  plans,
  interval,
  onIntervalChange,
}: {
  plans: PlansState & { retry: () => void };
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
}) {
  const t = useT();
  const p = t.pricing;
  return (
    <section className="section pricing" id="precios" aria-labelledby="precios-title">
      <div className="container">
        <header className="section__head pricing__head" data-reveal>
          <p className="eyebrow">{p.eyebrow}</p>
          <h2 className="display section__title" id="precios-title">
            {p.title}
          </h2>
          <p className="section__lead">{p.lead(TRIAL_DAYS)}</p>
        </header>

        <IntervalToggle value={interval} onChange={onIntervalChange} />

        {plans.status === 'loading' && (
          <ul className="plans" aria-busy="true" aria-label={p.loadingLabel}>
            {[0, 1, 2].map((n) => (
              <li key={n} className="plan plan--skeleton" aria-hidden="true" />
            ))}
          </ul>
        )}

        {plans.status === 'error' && (
          <div className="notice notice--error" role="alert">
            <p>
              {p.loadError} {t.common.apiDetail(plans.message, plans.httpStatus)}
            </p>
            <button type="button" className="btn btn--outline" onClick={plans.retry}>
              {t.common.retry}
            </button>
          </div>
        )}

        {plans.status === 'ready' && (
          <ul className="plans">
            {plans.plans.map((plan) => (
              <PlanCard key={plan.code} plan={plan} interval={interval} />
            ))}
          </ul>
        )}

        <p className="fine-print">{p.fine}</p>
      </div>
    </section>
  );
}
