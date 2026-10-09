import { IonIcon } from '@ionic/react';
import { icons } from '../ui/icons';
import './forms.css';

export type ValidationTone = 'error' | 'success' | 'info';

export interface ValidationMessageProps {
  tone?: ValidationTone;
  children: string;
  /** Wire this to the input via aria-describedby. */
  id?: string;
}

const toneIcon = {
  error: icons.alertCircle,
  success: icons.checkmarkCircle,
  info: icons.informationCircle,
} as const;

/**
 * Single line of feedback under a field. Errors get `role="alert"` so a screen
 * reader announces them without the user having to hunt for the change.
 */
export const ValidationMessage = ({ tone = 'error', children, id }: ValidationMessageProps) => (
  <span
    id={id}
    className={`vt-validation vt-validation--${tone}`}
    role={tone === 'error' ? 'alert' : undefined}
  >
    <IonIcon aria-hidden="true" icon={toneIcon[tone]} />
    {children}
  </span>
);
