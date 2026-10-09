import { useQuery } from '@tanstack/react-query';

import { useApi, useSession } from '@/app/services';
import { useI18n } from '@/i18n';
import { panelBillingOverviewSchema, type PanelBillingOverview } from '@/lib/billing-schemas';

/** Contacto para coordinar el pago mientras no hay alta de tarjeta en el panel. */
export const BILLING_CONTACT_EMAIL = 'hola@ventea.tech';

export const BILLING_QUERY_KEY = ['billing'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `GET /api/billing` (solo el dueño: la API responde 403 al resto). Compartido por la página de
 * Facturación y el aviso del marco del panel: misma caché.
 */
export function useBillingOverview() {
  const session = useSession();
  const client = useApi();
  return useQuery({
    queryKey: BILLING_QUERY_KEY,
    enabled: session?.staff.role === 'owner',
    queryFn: ({ signal }) =>
      client.request<PanelBillingOverview>('/billing', {
        schema: panelBillingOverviewSchema,
        signal,
      }),
  });
}

/** Días enteros que faltan hasta `date` (mínimo 0). */
export function daysLeft(date: Date, now = Date.now()): number {
  return Math.max(0, Math.ceil((date.getTime() - now) / DAY_MS));
}

const contact = <a href={`mailto:${BILLING_CONTACT_EMAIL}`}>{BILLING_CONTACT_EMAIL}</a>;

/**
 * Aviso de pago pendiente (TASK-007). En gracia el servicio SIGUE activo hasta `graceEndsAt`
 * (la API atiende menú y pedidos); sin gracia (prueba vencida sin pago) está pausado.
 */
export function PastDueBanner({ data }: { data: PanelBillingOverview }) {
  const { t, rich, day } = useI18n();
  if (data.graceEndsAt) {
    const left = daysLeft(data.graceEndsAt);
    return (
      <p className="banner banner--warn" role="alert">
        {rich('banner.pastDueGrace', {
          date: day(data.graceEndsAt),
          left: t('banner.daysLeft', { count: left }),
          email: contact,
        })}
      </p>
    );
  }
  return (
    <p className="banner banner--danger" role="alert">
      {rich('banner.pastDuePaused', { email: contact })}
    </p>
  );
}

/** Aviso según el estado de la suscripción, en la página de Facturación. */
export function StatusBanner({ data }: { data: PanelBillingOverview }) {
  const { rich } = useI18n();
  if (data.status === 'suspended') {
    return (
      <p className="banner banner--danger" role="alert">
        {rich('banner.suspended', { email: contact })}
      </p>
    );
  }
  if (data.status === 'past_due') return <PastDueBanner data={data} />;
  if (data.status === 'canceled') {
    return (
      <p className="banner banner--danger" role="alert">
        {rich('banner.canceled', { email: contact })}
      </p>
    );
  }
  return null;
}
