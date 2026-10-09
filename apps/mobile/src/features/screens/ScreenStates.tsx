import { EmptyState, ErrorState } from '../../components/feedback/EmptyState';
import { Button } from '../../components/ui/Button';
import { t } from '../../i18n';

export interface RetryStateProps {
  /** Message from the API client, already written for a guest. */
  message: string;
  onRetry: () => void;
  title?: string;
}

/**
 * Load failure with its one way out. Every screen that reads the API shows
 * this instead of a blank page when the network or the API lets it down.
 */
export const RetryState = ({
  message,
  onRetry,
  title = t('state.errorTitle'),
}: RetryStateProps) => (
  <ErrorState
    title={title}
    description={message}
    action={
      <Button variant="outline" onClick={onRetry}>
        {t('common.tryAgain')}
      </Button>
    }
  />
);

export interface SignInStateProps {
  description: string;
  onSignIn?: () => void;
}

/**
 * Shown by account screens rendered without a session. In the app the route
 * guard redirects before this is ever seen; the design system page renders
 * the screens directly, and there this is the honest thing to show.
 */
export const SignInState = ({ description, onSignIn }: SignInStateProps) => (
  <EmptyState
    icon="personOutline"
    title={t('auth.signInToContinue')}
    description={description}
    action={
      onSignIn && (
        <Button variant="primary" onClick={onSignIn}>
          {t('auth.signIn')}
        </Button>
      )
    }
  />
);
