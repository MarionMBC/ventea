import type { PlanUsage as Usage } from '@ventea/shared';

import { useI18n } from '@/i18n';

/** ¿El plan ya no admite otro? (`max` null = ilimitado.) */
export function usageFull(usage: Usage): boolean {
  return usage.max !== null && usage.used >= usage.max;
}

/**
 * Cupo del plan para un recurso (sucursales activas, usuarios del panel): barra y texto, con
 * aviso cuando se llegó al tope.
 */
export function PlanUsage({ label, usage }: { label: string; usage: Usage }) {
  const { t } = useI18n();
  const plan = usage.plan ? t(`plan.${usage.plan}`) : (usage.planName ?? t('errors.yourPlan'));
  const full = usageFull(usage);
  const text =
    usage.max === null
      ? t('usage.unlimited', { used: usage.used, plan })
      : t('usage.limited', { used: usage.used, max: usage.max, plan });
  return (
    <div className={`usage${full ? ' usage--full' : ''}`}>
      <div className="usage__row">
        <span className="usage__label">{label}</span>
        <span className="usage__text">{text}</span>
      </div>
      {usage.max !== null && (
        <span
          className="usage__bar"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={usage.max}
          aria-valuenow={Math.min(usage.used, usage.max)}
          aria-valuetext={text}
        >
          <span
            className="usage__fill"
            style={{
              width: `${usage.max === 0 ? 100 : Math.min(100, (usage.used / usage.max) * 100)}%`,
            }}
          />
        </span>
      )}
      {full && <p className="usage__note">{t('usage.full')}</p>}
    </div>
  );
}
