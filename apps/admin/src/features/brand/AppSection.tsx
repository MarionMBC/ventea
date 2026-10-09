import type { Brand } from '@ventea/shared';
import { Link } from 'react-router-dom';

import { describeError, useI18n } from '@/i18n';
import { IconSmartphone } from '@/ui/icons';

import { useRequestApp } from './api';

/**
 * «App propia»: la app de la marca en las tiendas. Con Pro/Cadena el dueño la pide y ve su
 * estado (la plataforma la arma y publica); con Básico ve qué plan la incluye.
 */
export function AppSection({ brand, onRequested }: { brand: Brand; onRequested: () => void }) {
  const i18n = useI18n();
  const { t, day } = i18n;
  const request = useRequestApp();
  const { app } = brand;
  const stores = [
    { key: 'android', url: app.storeUrls.android, label: t('ownApp.googlePlay') },
    { key: 'ios', url: app.storeUrls.ios, label: t('ownApp.appStore') },
  ].filter((store) => store.url);

  return (
    <article className="card own-app" aria-labelledby="own-app-title">
      <div className="card__head">
        <span className="card__icon" aria-hidden="true">
          <IconSmartphone size={20} />
        </span>
        <h2 id="own-app-title">{t('ownApp.title')}</h2>
        {app.brandedAppAvailable && (
          <span className={`pf-badge own-app__status own-app__status--${app.status}`}>
            {t(`appStatus.${app.status}`)}
          </span>
        )}
      </div>

      {!app.brandedAppAvailable ? (
        <>
          <p className="muted">{t('ownApp.upsell')}</p>
          <div className="card__actions">
            <Link className="btn btn--primary" to="/facturacion">
              {t('ownApp.upgrade')}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{t(`appStatusBody.${app.status}`)}</p>
          {app.status !== 'not_requested' && (
            <dl className="facts">
              {app.requestedAt && (
                <div>
                  <dt>{t('ownApp.requestedAt')}</dt>
                  <dd>{day(app.requestedAt)}</dd>
                </div>
              )}
              {app.publisher && (
                <div>
                  <dt>{t('ownApp.publisher')}</dt>
                  <dd>{t(`appPublisher.${app.publisher}`)}</dd>
                </div>
              )}
              {app.version && (
                <div>
                  <dt>{t('ownApp.version')}</dt>
                  <dd>{app.version}</dd>
                </div>
              )}
            </dl>
          )}
          {stores.length > 0 && (
            <ul className="own-app__stores">
              {stores.map((store) => (
                <li key={store.key}>
                  <a className="btn btn--ghost" href={store.url!} target="_blank" rel="noreferrer">
                    {store.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {request.error && (
            <p className="form-error" role="alert">
              {describeError(request.error, i18n)}
            </p>
          )}
          {app.status === 'not_requested' && (
            <div className="card__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={request.isPending}
                onClick={() => request.mutate(undefined, { onSuccess: onRequested })}
              >
                {request.isPending ? t('ownApp.requesting') : t('ownApp.request')}
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
