import { SUBSCRIPTION_STATUS } from '@ventea/shared';

import { useBillingSummary } from './hooks';
import { formatUsdCents, STATUS_LABEL } from './labels';

/** Cabecera de la lista: MRR, marcas por estado, cobros sin resolver y alertas (7 días). */
export function BillingSummaryBar() {
  const { data, error } = useBillingSummary();
  if (error) {
    return <p className="pf-muted">Resumen de cobro no disponible: {error.message}</p>;
  }
  if (!data) return null;

  const byStatus = SUBSCRIPTION_STATUS.filter((s) => (data.byStatus[s] ?? 0) > 0)
    .map((s) => `${STATUS_LABEL[s]} ${data.byStatus[s]}`)
    .join(' · ');

  return (
    <dl className="pf-summary" aria-label="Resumen de cobro">
      <div>
        <dt>MRR</dt>
        <dd>
          {formatUsdCents(data.mrrCents)}
          <small>{data.currency} al mes, suscripciones activas</small>
        </dd>
      </div>
      <div>
        <dt>Marcas por estado</dt>
        <dd>
          <small>{byStatus || 'Sin marcas'}</small>
        </dd>
      </div>
      <div className={data.unresolvedPayments > 0 ? 'is-alert' : undefined}>
        <dt>Cobros sin resolver</dt>
        <dd>{data.unresolvedPayments}</dd>
      </div>
      <div className={data.failuresLast7Days > 0 ? 'is-alert' : undefined}>
        <dt>Rechazos (7 días)</dt>
        <dd>{data.failuresLast7Days}</dd>
      </div>
      <div className={data.alertsLast7Days > 0 ? 'is-alert' : undefined}>
        <dt>Alertas (7 días)</dt>
        <dd>{data.alertsLast7Days}</dd>
      </div>
    </dl>
  );
}
