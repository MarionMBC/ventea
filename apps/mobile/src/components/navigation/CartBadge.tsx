import { IonBadge, IonIcon } from '@ionic/react';
import { useAppState } from '../../features/appStateContext';
import { icons } from '../ui/icons';

/**
 * Cart icon for the tab bar. Separate from `CartButton` because inside an
 * `IonTabButton` the tap target, the routing and the label already belong to
 * Ionic — only the icon and its counter are ours.
 */
export const CartBadge = () => {
  const { cartCount } = useAppState();
  return (
    <>
      <IonIcon aria-hidden="true" icon={icons.bagHandleOutline} />
      {cartCount > 0 && (
        <IonBadge color="secondary" aria-label={`${cartCount} items in the cart`}>
          {cartCount}
        </IonBadge>
      )}
    </>
  );
};
