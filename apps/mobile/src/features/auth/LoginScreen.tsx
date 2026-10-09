import { useState } from 'react';
import type { FormEvent } from 'react';
import { InlineAlert } from '../../components/feedback/InlineAlert';
import { PasswordField } from '../../components/forms/PasswordField';
import { TextField } from '../../components/forms/TextField';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { Button } from '../../components/ui/Button';
import { BackHeader } from '../../components/navigation/AppHeader';
import { ScreenShell } from '../screens/ScreenShell';
import { errorMessage } from '../useResource';
import { t } from '../../i18n';
import { EMAIL_PATTERN } from './validation';
import { useAuth } from './authContext';
import '../screens/screens.css';

export interface LoginScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  /** Called once the session exists; the page decides where to go. */
  onSignedIn?: () => void;
  onOpenRegister?: () => void;
}

/**
 * Sign in. Checks only what can be checked locally (an email shape, a
 * non-empty password); a wrong combination comes back from the API with one
 * generic message, on purpose, so the screen cannot reveal which emails exist.
 */
export const LoginScreen = ({
  embedded = false,
  onBack,
  onSignedIn,
  onOpenRegister,
}: LoginScreenProps) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  const emailValid = EMAIL_PATTERN.test(email.trim());
  const emailError = submitted && !emailValid ? t('auth.emailInvalid') : undefined;
  const passwordError = submitted && password.length === 0 ? t('auth.passwordRequired') : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFailure(undefined);
    if (!emailValid || password.length === 0) return;
    setSubmitting(true);
    try {
      await signIn({ email, password });
      onSignedIn?.();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell header={<BackHeader title={t('auth.signIn')} onBack={onBack} flush={embedded} />}>
      <form className="vt-screen__inner" onSubmit={submit} noValidate>
        <div className="vt-stack-2" style={{ alignItems: 'center', textAlign: 'center' }}>
          <BrandLogo size={72} labelled={false} />
          <h2 className="vt-h2">{t('auth.welcomeBack')}</h2>
          <p className="vt-body vt-text-secondary">{t('auth.signInIntro')}</p>
        </div>

        {failure && (
          <InlineAlert tone="danger" title={t('auth.signInFailed')}>
            {failure}
          </InlineAlert>
        )}

        <div className="vt-stack-3">
          <TextField
            label={t('auth.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            iconStart="person"
            value={email}
            error={emailError}
            onChange={(event) => setEmail(event.target.value)}
          />
          <PasswordField
            label={t('auth.password')}
            autoComplete="current-password"
            value={password}
            error={passwordError}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={submitting}
          loadingLabel={t('auth.signingIn')}
        >
          {t('auth.signIn')}
        </Button>
        <Button variant="ghost" block onClick={onOpenRegister}>
          {t('auth.newHere')}
        </Button>
      </form>
    </ScreenShell>
  );
};
