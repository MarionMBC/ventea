import { t } from '../../i18n';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { IonToast } from '@ionic/react';
import { icons } from '../ui/icons';
import { ToastContext } from './toastContext';
import type { ToastRequest } from './toastContext';

const toneIcon = {
  success: icons.checkmarkCircle,
  warning: icons.timeOutline,
  danger: icons.alertCircle,
  info: icons.informationCircle,
} as const;

const toneColor = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'primary',
} as const;

/**
 * Single toast host for the app. `IonToast` is used rather than a bespoke
 * element because it already handles queueing, the safe area and the
 * screen-reader announcement; only its colours come from our tokens.
 */
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [request, setRequest] = useState<ToastRequest | null>(null);

  const showToast = useCallback((next: ToastRequest) => setRequest(next), []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <IonToast
        isOpen={request !== null}
        message={request?.message}
        duration={request?.duration ?? 2600}
        icon={toneIcon[request?.tone ?? 'success']}
        color={toneColor[request?.tone ?? 'success']}
        position="bottom"
        onDidDismiss={() => setRequest(null)}
        buttons={[{ text: t('common.close'), role: 'cancel' }]}
      />
    </ToastContext.Provider>
  );
};
