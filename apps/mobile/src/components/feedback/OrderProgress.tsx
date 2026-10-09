import { t } from '../../i18n';
import { Fragment } from 'react';
import { IonIcon } from '@ionic/react';
import type { OrderStatus } from '../../types/order';
import { orderStepLabel, orderSteps } from './orderStatus';
import { resolveIcon } from '../ui/icons';
import './feedback.css';

export interface OrderProgressProps {
  status: OrderStatus;
}

/**
 * Four-step order timeline. Cancelled orders have no position on this line,
 * so the component renders nothing and the caller shows a status badge instead.
 */
export const OrderProgress = ({ status }: OrderProgressProps) => {
  if (status === 'cancelled') return null;

  const currentIndex = orderSteps.findIndex((step) => step.status === status);
  const current = orderSteps[currentIndex];

  return (
    <div className="vt-stack-2">
      <div
        className="vt-progress-steps"
        role="img"
        aria-label={t('a11y.orderProgress', {
          status: current ? orderStepLabel(current.status) : '',
          step: currentIndex + 1,
          total: orderSteps.length,
        })}
      >
        {orderSteps.map((step, index) => (
          <Fragment key={step.status}>
            {index > 0 && (
              <span
                className={`vt-progress-steps__line${
                  index <= currentIndex ? ' vt-progress-steps__line--done' : ''
                }`}
              />
            )}
            <span
              className={[
                'vt-progress-steps__dot',
                index <= currentIndex ? 'vt-progress-steps__dot--done' : '',
                index === currentIndex ? 'vt-progress-steps__dot--current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <IonIcon aria-hidden="true" icon={resolveIcon(step.icon)} />
            </span>
          </Fragment>
        ))}
      </div>
      <div className="vt-progress-labels" aria-hidden="true">
        {orderSteps.map((step, index) => (
          <span key={step.status} data-current={index === currentIndex}>
            {orderStepLabel(step.status)}
          </span>
        ))}
      </div>
    </div>
  );
};

export interface ProgressBarProps {
  /** 0–100. */
  value: number;
  label: string;
}

/** Determinate linear progress, e.g. "faltan $6 para envío gratis". */
export const ProgressBar = ({ value, label }: ProgressBarProps) => (
  <div
    className="vt-progress-bar"
    role="progressbar"
    aria-valuenow={Math.round(value)}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={label}
  >
    <div
      className="vt-progress-bar__fill"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);
