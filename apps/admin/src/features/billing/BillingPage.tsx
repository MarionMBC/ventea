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
import {
  cardLabel,
  formatDateTime,
  formatDay,
  formatUsdCents,
  INTERVAL_LABEL,
  PLAN_LABEL,
} from '@/features/platform/labels';
import { StatusBadge } from '@/features/platform/StatusBadge';
import { panelBillingOverviewSchema, type PanelBillingOverview } from '@/lib/billing-schemas';

/** Contacto para coordinar el pago mientras no hay alta de tarjeta en el panel. */
export const BILLING_CONTACT_EMAIL = 'hola@ventea.tech';

export const BILLING_QUERY_KEY = ['billing'] as const;

const plansSchema = {
  parse: (data: unknown): Plan[] =>
    Array.isArray(data) ? data.map((plan) => planSchema.parse(plan)) : [],
};

type Action = 'change-plan' | 'cancel' | 'resume';

/**
 * Facturación de la marca (`GET /api/billing`), solo para el dueño: la API responde 403
 * a manager y staff, y el panel ni siquiera muestra la sección. Funciona con la marca
 * suspendida: las rutas de billing quedan abiertas para que el dueño pueda regularizar.
 */
export function BillingPage() {
  const session = useSession();
  const client = useApi();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Action | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Facturación · Ventea';
  }, []);

  const billing = useQuery({
    queryKey: BILLING_QUERY_KEY,
    enabled: session?.staff.role === 'owner',
    queryFn: ({ signal }) =>
      client.request<PanelBillingOverview>('/billing', {
        schema: panelBillingOverviewSchema,
        signal,
      }),
  });

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
        <h1>No se pudo cargar la facturación</h1>
        <p>{billing.error.message}</p>
      </div>
    );
  }
  if (!billing.data) return <p className="pf-muted">Cargando facturación…</p>;

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
  const periodEnd = formatDay(data.currentPeriodEnd);

  return (
    <section className="pf-page billing" aria-labelledby="billing-title">
      <div className="pf-page__head">
        <h1 id="billing-title">Facturación</h1>
        <StatusBadge status={data.status} />
      </div>

      <StatusBanner data={data} />

      {done && (
        <p className="pf-flash" role="status">
          {done}
        </p>
      )}

      <div className="pf-grid">
        <article className="pf-card" aria-labelledby="billing-plan">
          <h2 id="billing-plan">Tu plan</h2>
          <dl className="pf-facts">
            <Fact label="Plan">
              {data.planName} {INTERVAL_LABEL[data.interval]}
            </Fact>
            <Fact label="Precio">
              {formatUsdCents(data.price.amountCents)} {data.price.currency} /{' '}
              {data.interval === 'year' ? 'año' : 'mes'}
            </Fact>
            <Fact label="Estado">
              <StatusBadge status={data.status} />
            </Fact>
            {data.status === 'trialing' && data.trialEndsAt && (
              <Fact label="Prueba gratis hasta">{formatDay(data.trialEndsAt)}</Fact>
            )}
            <Fact label="Período actual">
              {formatDay(data.currentPeriodStart)} – {periodEnd}
            </Fact>
            {data.retryAt && <Fact label="Próximo reintento">{formatDay(data.retryAt)}</Fact>}
            {data.pendingPlan && (
              <Fact label="Cambio agendado">
                {PLAN_LABEL[data.pendingPlan.planCode]} {INTERVAL_LABEL[data.pendingPlan.interval]}{' '}
                desde el {periodEnd}
              </Fact>
            )}
            <Fact label="Renovación">
              {data.cancelAtPeriodEnd ? `Se cancela el ${periodEnd}` : 'Automática'}
            </Fact>
          </dl>
          <div className="pf-actions" role="group" aria-label="Acciones del plan">
            <button type="button" className="btn btn--ghost" onClick={() => open('change-plan')}>
              Cambiar plan
            </button>
            {data.cancelAtPeriodEnd ? (
              <button type="button" className="btn btn--primary" onClick={() => open('resume')}>
                Reanudar suscripción
              </button>
            ) : (
              data.status !== 'canceled' && (
                <button type="button" className="btn btn--danger" onClick={() => open('cancel')}>
                  Cancelar suscripción
                </button>
              )
            )}
          </div>
        </article>

        <article className="pf-card" aria-labelledby="billing-card">
          <h2 id="billing-card">Forma de pago</h2>
          <dl className="pf-facts">
            <Fact label="Tarjeta">{cardLabel(data.card)}</Fact>
          </dl>
          <p className="billing__note">
            El pago se coordina con el equipo de Ventea: escríbenos a{' '}
            <a href={`mailto:${BILLING_CONTACT_EMAIL}`}>{BILLING_CONTACT_EMAIL}</a>.
          </p>
          {data.mode !== 'manual' && (
            <p className="pf-muted">
              Pronto vas a poder registrar tu tarjeta desde acá para el cobro automático.
            </p>
          )}
        </article>
      </div>

      <article className="pf-card" aria-labelledby="billing-events">
        <h2 id="billing-events">Movimientos recientes</h2>
        {data.events.length === 0 ? (
          <p className="pf-muted">Sin movimientos.</p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <caption className="sr-only">Últimos movimientos, el más reciente primero</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Movimiento</th>
                  <th scope="col" className="pf-num">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event, index) => (
                  <tr key={`${event.createdAt.toISOString()}-${index}`}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>{event.description}</td>
                    <td className="pf-num">
                      {event.amountCents === null ? '—' : formatUsdCents(event.amountCents)}
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
          error={action.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={(planCode, interval) =>
            run(
              'change-plan',
              { planCode, interval },
              `Cambio de plan agendado: empieza el ${periodEnd}.`,
            )
          }
        />
      )}
      {dialog === 'cancel' && (
        <ConfirmDialog
          title="¿Cancelar tu suscripción?"
          confirmLabel="Sí, cancelar"
          danger
          pending={action.isPending}
          error={action.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            run('cancel', undefined, `Listo: tu servicio sigue hasta el ${periodEnd}.`)
          }
        >
          <p>
            Tu restaurante sigue funcionando hasta el <strong>{periodEnd}</strong>. Después tus
            clientes ya no van a poder pedir. Puedes reanudarla antes de esa fecha.
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'resume' && (
        <ConfirmDialog
          title="¿Reanudar tu suscripción?"
          confirmLabel="Reanudar"
          pending={action.isPending}
          error={action.error?.message}
          onCancel={() => setDialog(null)}
          onConfirm={() => run('resume', undefined, 'Suscripción reanudada.')}
        >
          <p>Se anula la cancelación: tu plan se renueva normalmente el {periodEnd}.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function StatusBanner({ data }: { data: PanelBillingOverview }) {
  const contact = <a href={`mailto:${BILLING_CONTACT_EMAIL}`}>{BILLING_CONTACT_EMAIL}</a>;
  if (data.status === 'suspended') {
    return (
      <p className="pf-banner pf-banner--danger" role="alert">
        Tu servicio está suspendido: tus clientes no pueden ver el menú ni hacer pedidos. Para
        reactivarlo escríbenos a {contact}.
      </p>
    );
  }
  if (data.status === 'past_due') {
    return (
      <p className="pf-banner pf-banner--warn" role="alert">
        Tienes un pago pendiente. Regularízalo para que tu servicio no se suspenda: escríbenos a{' '}
        {contact}.
      </p>
    );
  }
  if (data.status === 'canceled') {
    return (
      <p className="pf-banner pf-banner--danger" role="alert">
        Tu suscripción está cancelada. Para volver, escríbenos a {contact}.
      </p>
    );
  }
  return null;
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
      title="Cambiar plan"
      confirmLabel="Agendar cambio"
      onConfirm={() => (unchanged ? props.onCancel() : onConfirm(planCode, interval))}
    >
      <label className="field">
        <span className="field__label">Plan</span>
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
          {!plans.data && <option value={current.planCode}>{PLAN_LABEL[current.planCode]}</option>}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Forma de pago</span>
        <select
          className="field__input"
          value={interval}
          onChange={(event) => setBillingInterval(event.target.value as BillingInterval)}
        >
          {BILLING_INTERVAL.map((value) => (
            <option key={value} value={value}>
              {value === 'year' ? 'Anual (2 meses gratis)' : 'Mensual'}
            </option>
          ))}
        </select>
      </label>
      {price && (
        <p>
          Nuevo precio:{' '}
          <strong>
            {formatUsdCents(interval === 'year' ? price.priceYearlyCents : price.priceMonthlyCents)}{' '}
            USD / {interval === 'year' ? 'año' : 'mes'}
          </strong>
        </p>
      )}
      <p className="pf-muted">
        El cambio empieza el {periodEnd}, al abrir tu próximo período. No hay cobros proporcionales.
      </p>
    </ConfirmDialog>
  );
}
