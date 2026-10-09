import type { StaffLocation } from '@ventea/shared';
import { useEffect, useState } from 'react';

import { useSession } from '@/app/services';
import { useTenant } from '@/app/tenant';
import { describeError, useI18n, type I18n } from '@/i18n';
import { brandName } from '@/ui/Brand';
import {
  IconAlert,
  IconClock,
  IconEdit,
  IconLocation,
  IconPhone,
  IconPlus,
  IconRefresh,
} from '@/ui/icons';
import { PlanUsage, usageFull } from '@/ui/PlanUsage';

import { useStaffLocations } from './api';
import { hoursGroups } from './hours';
import { LocationDrawer } from './LocationDrawer';

function hoursText(location: StaffLocation, t: I18n['t']): string {
  if (location.openingHours.length === 0) return t('locations.noHours');
  return hoursGroups(location.openingHours)
    .map((group) => {
      const days =
        group.from === group.to
          ? t(`daysShort.${group.from}`)
          : `${t(`daysShort.${group.from}`)}–${t(`daysShort.${group.to}`)}`;
      const times = group.ranges
        ? group.ranges.map((r) => `${r.opens}–${r.closes}`).join(', ')
        : t('locations.closed');
      return `${days} ${times}`;
    })
    .join(' · ');
}

/**
 * Sucursales (`/admin/locations`). Cualquier miembro del equipo las ve; owner y manager crean,
 * editan y borran (staff ve la lista sin acciones). Muestra el cupo de sucursales activas del
 * plan: al tope, la nueva nace inactiva para no chocar con el límite.
 */
export function LocationsPage() {
  const session = useSession();
  const canEdit = session?.staff.role === 'owner' || session?.staff.role === 'manager';
  const i18n = useI18n();
  const { t } = i18n;
  const { data: tenant } = useTenant();
  const query = useStaffLocations();
  const [editing, setEditing] = useState<StaffLocation | 'new' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const brand = brandName(tenant);
  useEffect(() => {
    document.title = t('locations.pageTitle', { brand });
  }, [t, brand]);

  if (query.error && !query.data) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('locations.errorTitle')}</h1>
        <p>{describeError(query.error, i18n)}</p>
        <button type="button" className="btn btn--primary" onClick={() => void query.refetch()}>
          <IconRefresh size={18} />
          {t('board.retry')}
        </button>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="page" role="status">
        <span className="sr-only">{t('locations.loading')}</span>
        {[0, 1].map((i) => (
          <div key={i} className="card card--skeleton" aria-hidden="true">
            <span className="skeleton" style={{ width: '40%', height: 22 }} />
            <span className="skeleton" style={{ width: '80%', height: 14 }} />
          </div>
        ))}
      </div>
    );
  }

  const { locations, usage } = query.data;
  const done = (message: string) => {
    setEditing(null);
    setFlash(message);
  };

  return (
    <section className="page" aria-labelledby="locations-title">
      <header className="page-head">
        <div className="page-head__text">
          <h1 id="locations-title" className="page-head__title">
            {t('locations.title')}
          </h1>
          <p className="page-head__sub">{t('locations.subtitle')}</p>
        </div>
        {canEdit && (
          <div className="page-head__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setFlash(null);
                setEditing('new');
              }}
            >
              <IconPlus size={18} />
              {t('locations.add')}
            </button>
          </div>
        )}
      </header>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      <PlanUsage label={t('locations.usageLabel')} usage={usage} />
      {!canEdit && <p className="muted">{t('locations.readOnly')}</p>}

      {locations.length === 0 ? (
        <div className="state state--empty">
          <span className="state__icon">
            <IconLocation size={28} />
          </span>
          <h2>{t('locations.emptyTitle')}</h2>
          <p>{t('locations.emptyBody')}</p>
        </div>
      ) : (
        <ul className="loc-list">
          {locations.map((location) => (
            <li
              key={location.id}
              className={`card loc-card${location.isActive ? '' : ' is-inactive'}`}
            >
              <div className="loc-card__head">
                <h2 className="loc-card__name">{location.name}</h2>
                <span className="loc-card__tags">
                  <span className={`tag ${location.isActive ? 'tag--ok' : 'tag--muted'}`}>
                    {location.isActive ? t('locations.active') : t('locations.inactive')}
                  </span>
                  {location.isActive && (
                    <span className={`tag ${location.acceptsOrders ? 'tag--ok' : 'tag--danger'}`}>
                      {location.acceptsOrders
                        ? t('locations.takingOrders')
                        : t('locations.notTakingOrders')}
                    </span>
                  )}
                </span>
              </div>
              <dl className="loc-card__facts">
                <div>
                  <dt>
                    <IconLocation size={16} />
                    <span className="sr-only">{t('locations.address')}</span>
                  </dt>
                  <dd>{location.address}</dd>
                </div>
                <div>
                  <dt>
                    <IconPhone size={16} />
                    <span className="sr-only">{t('locations.phone')}</span>
                  </dt>
                  <dd className={location.phone ? undefined : 'muted'}>
                    {location.phone ?? t('locations.noPhone')}
                  </dd>
                </div>
                <div>
                  <dt>
                    <IconClock size={16} />
                    <span className="sr-only">{t('locations.hours')}</span>
                  </dt>
                  <dd>{hoursText(location, t)}</dd>
                </div>
              </dl>
              {canEdit && (
                <div className="card__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    aria-label={t('locations.editAria', { name: location.name })}
                    onClick={() => {
                      setFlash(null);
                      setEditing(location);
                    }}
                  >
                    <IconEdit size={16} />
                    {t('locations.edit')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <LocationDrawer
          location={editing === 'new' ? null : editing}
          activeByDefault={!usageFull(usage)}
          onClose={() => setEditing(null)}
          onDone={done}
        />
      )}
    </section>
  );
}
