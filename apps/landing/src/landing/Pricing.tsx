import type { BillingInterval, Plan } from '@ventea/shared';

import { TRIAL_DAYS } from '@/config';
import { formatUsd, priceFor, yearlySavingsCents } from '@/lib/format';
import { planFeatures, planTagline } from '@/lib/plans';
import type { PlansState } from '@/lib/usePlans';

import { IntervalToggle } from './IntervalToggle';

export function signupHref(plan: string, interval: BillingInterval): string {
  return `/registro?plan=${encodeURIComponent(plan)}&intervalo=${interval === 'year' ? 'anual' : 'mensual'}`;
}

function PlanCard({ plan, interval }: { plan: Plan; interval: BillingInterval }) {
  const featured = plan.code === 'pro';
  const price = priceFor(plan, interval);
  const savings = yearlySavingsCents(plan);
  const titleId = `plan-${plan.code}`;

  return (
    <li className={`plan${featured ? ' plan--featured' : ''}`} aria-labelledby={titleId}>
      {featured && <p className="plan__badge">Recomendado</p>}
      <h3 className="plan__name" id={titleId}>
        {plan.name}
      </h3>
      <p className="plan__tagline">{planTagline(plan.code)}</p>
      <p className="plan__price" data-testid={`price-${plan.code}`}>
        <span className="plan__amount">{formatUsd(price)}</span>
        <span className="plan__per"> USD / {interval === 'year' ? 'año' : 'mes'}</span>
      </p>
      <p className="plan__note">
        {interval === 'year'
          ? `Equivale a ${formatUsd(Math.round(price / 12))} al mes · ahorras ${formatUsd(savings)}`
          : `O ${formatUsd(plan.priceYearlyCents)} al año, con 2 meses gratis`}
      </p>
      <a
        className={`btn btn--block ${featured ? 'btn--primary' : 'btn--outline'}`}
        href={signupHref(plan.code, interval)}
      >
        Probar {plan.name} gratis
        <span className="sr-only"> durante {TRIAL_DAYS} días</span>
      </a>
      <ul className="plan__features">
        {planFeatures(plan).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </li>
  );
}

/** Precios reales desde la API, con el toggle mensual/anual. */
export function Pricing({
  plans,
  interval,
  onIntervalChange,
}: {
  plans: PlansState & { retry: () => void };
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
}) {
  return (
    <section className="section section--tint" id="precios" aria-labelledby="precios-title">
      <div className="container">
        <header className="section__head">
          <p className="eyebrow">Precios</p>
          <h2 className="section__title" id="precios-title">
            Un precio fijo. Cero comisión por pedido.
          </h2>
          <p className="section__lead">
            Todos los planes empiezan con {TRIAL_DAYS} días gratis, sin tarjeta. Cambia de plan
            cuando lo necesites.
          </p>
        </header>

        <IntervalToggle value={interval} onChange={onIntervalChange} />

        {plans.status === 'loading' && (
          <ul className="plans" aria-busy="true" aria-label="Cargando precios">
            {[0, 1, 2].map((n) => (
              <li key={n} className="plan plan--skeleton" aria-hidden="true" />
            ))}
          </ul>
        )}

        {plans.status === 'error' && (
          <div className="notice notice--error" role="alert">
            <p>No pudimos cargar los precios. {plans.message}</p>
            <button type="button" className="btn btn--outline" onClick={plans.retry}>
              Reintentar
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

        <p className="fine-print">
          Precios en dólares estadounidenses. Sin costo de instalación ni permanencia.
        </p>
      </div>
    </section>
  );
}
