import type { SubscriptionStatus } from '@ventea/shared';

import { STATUS_LABEL } from './labels';

export function StatusBadge({ status }: { status: SubscriptionStatus | undefined }) {
  if (!status) return <span className="pf-badge pf-badge--none">Sin suscripción</span>;
  return <span className={`pf-badge pf-badge--${status}`}>{STATUS_LABEL[status]}</span>;
}
