import {
  BILLING_INTERVAL,
  PAYMENT_RESOLUTION,
  type BillingInterval,
  type PaymentResolution,
  type PlanCode,
} from '@ventea/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { PanelOpenAttempt, PanelTenantDetail } from '@/lib/billing-schemas';

import { ConfirmDialog } from './ConfirmDialog';
import { BASE_DOMAIN } from './host';
import { usePlans, useTenantAction, useTenantDetail, type TenantAction } from './hooks';
import {
  canDo,
  cardLabel,
  eventLabel,
  formatDateTime,
  formatDay,
  formatUsdCents,
  INTERVAL_LABEL,
  PLAN_LABEL,
} from './labels';
import { StatusBadge } from './StatusBadge';

type DialogKind = TenantAction['kind'];

const DONE_MESSAGE: Record<DialogKind, string> = {
  suspend: 'Marca suspendida.',
  reactivate: 'Marca reactivada: período nuevo desde hoy.',
  'change-plan': 'Plan actualizado.',
  'extend-trial': 'Prueba extendida.',
  'record-payment': 'Pago registrado: período nuevo abierto.',
  'resolve-payment': 'Cobro resuelto.',
};

/** Precio del plan e intervalo actuales, para precargar un pago manual. */
function currentPriceCents(
  plans: { code: string; priceMonthlyCents: number; priceYearlyCents: number }[] | undefined,
  sub: { planCode: string; interval: BillingInterval } | null,
): number | undefined {
  const plan = sub && plans?.find((p) => p.code === sub.planCode);
  if (!plan || !sub) return undefined;
  return sub.interval === 'year' ? plan.priceYearlyCents : plan.priceMonthlyCents;
}

/** Detalle de una marca: datos, suscripción, eventos y acciones con confirmación. */
export function TenantDetail() {
  const { slug = '' } = useParams();
  const detail = useTenantDetail(slug);
  const plans = usePlans();
  const action = useTenantAction(slug);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${slug} · Plataforma · Ventea`;
  }, [slug]);

  const open = (kind: DialogKind) => {
    action.reset();
    setDone(null);
    setDialog(kind);
  };

  const run = (payload: TenantAction) =>
    action.mutate(payload, {
      onSuccess: () => {
        setDialog(null);
        setDone(DONE_MESSAGE[payload.kind]);
      },
    });

  if (detail.error) {
    return (
      <section className="pf-page">
        <BackLink />
        <div className="state state--error" role="alert">
          <h1>No se pudo cargar la marca</h1>
          <p>{detail.error.message}</p>
        </div>
      </section>
    );
  }
  if (!detail.data) {
    return (
      <section className="pf-page">
        <BackLink />
        <p className="pf-muted">Cargando marca…</p>
      </section>
    );
  }

  const tenant = detail.data;
  const sub = tenant.subscription;
  const status = sub?.status;
  const pending = action.isPending;
  const error = action.error?.message;

  return (
    <section className="pf-page" aria-labelledby="pf-detail-title">
      <BackLink />
      <div className="pf-page__head">
        <h1 id="pf-detail-title">{tenant.name}</h1>
        <StatusBadge status={status} />
      </div>

      {done && (
        <p className="pf-flash" role="status">
          {done}
        </p>
      )}

      <div className="pf-grid">
        <article className="pf-card" aria-labelledby="pf-data">
          <h2 id="pf-data">Datos</h2>
          <dl className="pf-facts">
            <Fact label="Slug">
              <code>{tenant.slug}</code>
            </Fact>
            <Fact label="Página">
              <a className="pf-link" href={`https://${tenant.slug}.${BASE_DOMAIN}`}>
                {tenant.slug}.{BASE_DOMAIN}
              </a>
            </Fact>
            <Fact label="Región">{tenant.region}</Fact>
            <Fact label="Alta">
              {formatDay(tenant.createdAt)} ·{' '}
              {tenant.createdVia === 'signup' ? 'registro' : 'script'}
            </Fact>
            <Fact label="Publicada">{tenant.isActive ? 'Sí' : 'No (desactivada)'}</Fact>
            <Fact label="Sucursales activas">{tenant.activeLocations}</Fact>
            <Fact label="Pedidos (30 días)">{tenant.ordersLast30Days}</Fact>
          </dl>
        </article>

        <article className="pf-card" aria-labelledby="pf-sub">
          <h2 id="pf-sub">Suscripción</h2>
          {sub ? (
            <dl className="pf-facts">
              <Fact label="Plan">
                {PLAN_LABEL[sub.planCode]} {INTERVAL_LABEL[sub.interval]}
              </Fact>
              <Fact label="Estado">
                <StatusBadge status={sub.status} />
              </Fact>
              {sub.trialEndsAt && <Fact label="Fin de prueba">{formatDay(sub.trialEndsAt)}</Fact>}
              <Fact label="Período">
                {formatDay(sub.currentPeriodStart)} – {formatDay(sub.currentPeriodEnd)}
              </Fact>
              <Fact label="Cancela al terminar">{sub.cancelAtPeriodEnd ? 'Sí' : 'No'}</Fact>
              <Fact label="Tarjeta">{cardLabel(tenant.card)}</Fact>
              {tenant.openAttempts.length > 0 && (
                <Fact label="Cobros sin confirmar">
                  {tenant.openAttempts.length} (bloquean cambios hasta resolverlos)
                </Fact>
              )}
            </dl>
          ) : (
            <p className="pf-muted">La marca no tiene suscripción.</p>
          )}

          <div className="pf-actions" role="group" aria-label="Acciones">
            {canDo('suspend', status) && (
              <button type="button" className="btn btn--danger" onClick={() => open('suspend')}>
                Suspender
              </button>
            )}
            {canDo('reactivate', status) && (
              <button type="button" className="btn btn--primary" onClick={() => open('reactivate')}>
                Reactivar
              </button>
            )}
            {canDo('change_plan', status) && (
              <button type="button" className="btn btn--ghost" onClick={() => open('change-plan')}>
                Cambiar plan
              </button>
            )}
            {canDo('extend_trial', status) && (
              <button type="button" className="btn btn--ghost" onClick={() => open('extend-trial')}>
                Extender prueba
              </button>
            )}
            {sub && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => open('record-payment')}
              >
                Registrar pago
              </button>
            )}
            {tenant.openAttempts.length > 0 && (
              <button
                type="button"
                className="btn btn--warning"
                onClick={() => open('resolve-payment')}
              >
                Resolver cobro
              </button>
            )}
          </div>
        </article>
      </div>

      <article className="pf-card" aria-labelledby="pf-events">
        <h2 id="pf-events">Eventos de facturación</h2>
        {tenant.billingEvents.length === 0 ? (
          <p className="pf-muted">Sin eventos.</p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <caption className="sr-only">Últimos eventos, el más reciente primero</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Evento</th>
                  <th scope="col" className="pf-num">
                    Monto
                  </th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {tenant.billingEvents.map((event, index) => (
                  <tr key={`${event.createdAt.toISOString()}-${index}`}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>{eventLabel(event.type)}</td>
                    <td className="pf-num">
                      {event.amountCents === null ? '—' : formatUsdCents(event.amountCents)}
                    </td>
                    <td>{[event.status, event.message].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {dialog === 'suspend' && (
        <SuspendDialog
          tenant={tenant}
          pending={pending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => run({ kind: 'suspend', reason })}
        />
      )}
      {dialog === 'reactivate' && (
        <ConfirmDialog
          title={`¿Reactivar ${tenant.name}?`}
          confirmLabel="Reactivar"
          pending={pending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={() => run({ kind: 'reactivate' })}
        >
          <p>
            Queda <strong>activa</strong> con un período nuevo desde hoy (equivale a registrar un
            pago manual). Su menú y pedidos vuelven a funcionar en el acto.
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'change-plan' && sub && (
        <ChangePlanDialog
          current={{ planCode: sub.planCode, interval: sub.interval }}
          pending={pending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(planCode, interval) =>
            run({ kind: 'change-plan', input: { planCode, interval } })
          }
        />
      )}
      {dialog === 'extend-trial' && (
        <ExtendTrialDialog
          pending={pending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(days) => run({ kind: 'extend-trial', days })}
        />
      )}
      {dialog === 'record-payment' && (
        <RecordPaymentDialog
          suggestedCents={currentPriceCents(plans.data, sub)}
          pending={pending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(amountCents, reference) =>
            run({ kind: 'record-payment', amountCents, reference })
          }
        />
      )}
      {dialog === 'resolve-payment' && (
        <ResolvePaymentDialog
          attempts={tenant.openAttempts}
          pending={pending}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(orderId, outcome, note) =>
            run({ kind: 'resolve-payment', orderId, outcome, note })
          }
        />
      )}
    </section>
  );
}

function BackLink() {
  return (
    <Link to="/plataforma" className="pf-back">
      ← Marcas
    </Link>
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

interface DialogProps {
  pending: boolean;
  error?: string;
  onCancel: () => void;
}

function SuspendDialog({
  tenant,
  onConfirm,
  ...props
}: DialogProps & { tenant: PanelTenantDetail; onConfirm: (reason?: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog
      {...props}
      title={`¿Suspender ${tenant.name}?`}
      confirmLabel="Suspender"
      danger
      onConfirm={() => onConfirm(reason.trim() || undefined)}
    >
      <p>
        Su menú y sus pedidos dejan de funcionar para los clientes (responden «servicio
        suspendido»). El staff sigue pudiendo entrar al panel.
      </p>
      <label className="field">
        <span className="field__label">Motivo (opcional)</span>
        <span className="field__hint">{INTERNAL_NOTE}</span>
        <textarea
          className="field__input"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ConfirmDialog>
  );
}

function ChangePlanDialog({
  current,
  onConfirm,
  ...props
}: DialogProps & {
  current: { planCode: PlanCode; interval: BillingInterval };
  onConfirm: (planCode: PlanCode, interval: BillingInterval) => void;
}) {
  const plans = usePlans();
  const [planCode, setPlanCode] = useState<PlanCode>(current.planCode);
  const [interval, setBillingInterval] = useState<BillingInterval>(current.interval);
  const unchanged = planCode === current.planCode && interval === current.interval;
  return (
    <ConfirmDialog
      {...props}
      error={props.error ?? (plans.error ? plans.error.message : undefined)}
      title="Cambiar plan"
      confirmLabel="Cambiar plan"
      onConfirm={() => {
        if (!unchanged) onConfirm(planCode, interval);
        else props.onCancel();
      }}
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
              {plan.name} · {formatUsdCents(plan.priceMonthlyCents)}/mes
            </option>
          ))}
          {!plans.data && <option value={current.planCode}>{PLAN_LABEL[current.planCode]}</option>}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Intervalo</span>
        <select
          className="field__input"
          value={interval}
          onChange={(event) => setBillingInterval(event.target.value as BillingInterval)}
        >
          {BILLING_INTERVAL.map((value) => (
            <option key={value} value={value}>
              {INTERVAL_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <p className="pf-muted">
        No cambia el estado ni las fechas del período. Si la marca tiene más sucursales activas que
        las del plan nuevo, la API lo rechaza.
      </p>
    </ConfirmDialog>
  );
}

function ExtendTrialDialog({
  onConfirm,
  ...props
}: DialogProps & { onConfirm: (days: number) => void }) {
  const [days, setDays] = useState(7);
  const valid = Number.isInteger(days) && days >= 1 && days <= 90;
  return (
    <ConfirmDialog
      {...props}
      error={props.error ?? (valid ? undefined : 'Entre 1 y 90 días.')}
      title="Extender prueba"
      confirmLabel="Extender"
      onConfirm={() => valid && onConfirm(days)}
    >
      <label className="field">
        <span className="field__label">Días a sumar (1–90)</span>
        <input
          className="field__input"
          type="number"
          min={1}
          max={90}
          step={1}
          value={Number.isNaN(days) ? '' : days}
          onChange={(event) => setDays(event.target.valueAsNumber)}
        />
      </label>
      <p className="pf-muted">
        Se suman al fin de prueba actual (o a hoy, si ya venció). La marca queda en prueba.
      </p>
    </ConfirmDialog>
  );
}

function RecordPaymentDialog({
  suggestedCents,
  onConfirm,
  ...props
}: DialogProps & {
  suggestedCents?: number;
  onConfirm: (amountCents: number, reference: string) => void;
}) {
  // Precarga el precio del plan e intervalo actuales; se puede corregir.
  const [amount, setAmount] = useState(
    suggestedCents === undefined ? '' : (suggestedCents / 100).toFixed(2),
  );
  const [reference, setReference] = useState('');
  const cents = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && reference.trim().length > 0;
  return (
    <ConfirmDialog
      {...props}
      title="Registrar pago manual"
      confirmLabel="Registrar pago"
      onConfirm={() => valid && onConfirm(cents, reference.trim())}
    >
      <p className="pf-muted">
        Pago recibido por fuera (transferencia, depósito): abre un período nuevo y deja la marca
        activa. Con un cobro con tarjeta sin confirmar la API lo rechaza: primero hay que
        resolverlo.
      </p>
      <label className="field">
        <span className="field__label">Monto (USD)</span>
        <input
          className="field__input"
          type="number"
          min={0.01}
          step={0.01}
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">Referencia (transferencia, recibo…)</span>
        <span className="field__hint">
          {INTERNAL_NOTE} Una referencia ya registrada en esta marca se rechaza (409).
        </span>
        <input
          className="field__input"
          maxLength={200}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </label>
      {!valid && (amount || reference) && (
        <p className="pf-muted">Completa un monto mayor a 0 y una referencia.</p>
      )}
    </ConfirmDialog>
  );
}

/** Aviso en los campos de texto libre: van al historial interno, no al dueño. */
const INTERNAL_NOTE = 'Estas notas son internas, el cliente no las ve.';

const ATTEMPT_KIND_LABEL: Record<PanelOpenAttempt['kind'], string> = {
  establish: 'alta de tarjeta',
  renewal: 'renovación',
};

const OUTCOME_LABEL: Record<PaymentResolution, string> = {
  succeeded: 'Se cobró (aprobado en el procesador)',
  failed: 'No se cobró',
};

function ResolvePaymentDialog({
  attempts,
  onConfirm,
  ...props
}: DialogProps & {
  attempts: PanelOpenAttempt[];
  onConfirm: (orderId: string, outcome: PaymentResolution, note?: string) => void;
}) {
  const [orderId, setOrderId] = useState(attempts[0]?.orderId ?? '');
  const [outcome, setOutcome] = useState<PaymentResolution | null>(null);
  const [note, setNote] = useState('');
  const valid = orderId.trim().length > 0 && outcome !== null;
  return (
    <ConfirmDialog
      {...props}
      title="Resolver cobro sin confirmar"
      confirmLabel="Resolver"
      onConfirm={() => {
        if (valid && outcome) onConfirm(orderId.trim(), outcome, note.trim() || undefined);
      }}
    >
      <p className="pf-muted">
        Solo después de revisar el cobro en el panel del procesador. «Se cobró» aplica el período
        pagado; «No se cobró» lo cuenta como rechazo.
      </p>
      <label className="field">
        <span className="field__label">Cobro abierto</span>
        <select
          className="field__input"
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
        >
          {attempts.map((attempt) => (
            <option key={attempt.orderId} value={attempt.orderId}>
              {attempt.orderId} · {ATTEMPT_KIND_LABEL[attempt.kind]} ·{' '}
              {formatUsdCents(attempt.amountCents)} · {attempt.status}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="pf-radios">
        <legend className="field__label">Resultado</legend>
        {PAYMENT_RESOLUTION.map((value) => (
          <label key={value} className="pf-radio">
            <input
              type="radio"
              name="outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value)}
            />
            {OUTCOME_LABEL[value]}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span className="field__label">Nota (opcional)</span>
        <span className="field__hint">{INTERNAL_NOTE}</span>
        <input
          className="field__input"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
    </ConfirmDialog>
  );
}
