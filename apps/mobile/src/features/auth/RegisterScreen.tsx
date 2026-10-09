import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { InlineAlert } from '../../components/feedback/InlineAlert';
import { PasswordField } from '../../components/forms/PasswordField';
import { TextField } from '../../components/forms/TextField';
import { Button } from '../../components/ui/Button';
import { BackHeader } from '../../components/navigation/AppHeader';
import { ScreenShell } from '../screens/ScreenShell';
import { errorMessage } from '../useResource';
import {
  EMAIL_PATTERN,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_PHONE_LENGTH,
  MIN_PASSWORD_LENGTH,
  MIN_PHONE_LENGTH,
} from './validation';
import { t } from '../../i18n';
import { useAuth } from './authContext';
import '../screens/screens.css';

export interface RegisterScreenProps {
  embedded?: boolean;
  onBack?: () => void;
  onSignedIn?: () => void;
  onOpenLogin?: () => void;
}

interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

/** Field rules mirrored from the API contract, so most mistakes never leave the device. */
const validate = (form: RegisterForm): Partial<Record<keyof RegisterForm, string>> => ({
  firstName: form.firstName.trim() ? undefined : t('auth.firstNameRequired'),
  lastName: form.lastName.trim() ? undefined : t('auth.lastNameRequired'),
  email: EMAIL_PATTERN.test(form.email.trim()) ? undefined : t('auth.emailInvalid'),
  phone:
    !form.phone.trim() || form.phone.trim().length >= MIN_PHONE_LENGTH
      ? undefined
      : t('auth.phoneInvalid'),
  password:
    form.password.length >= MIN_PASSWORD_LENGTH
      ? undefined
      : t('auth.passwordTooShort', { count: MIN_PASSWORD_LENGTH }),
});

/** Create an account. The welcome points, if the brand gives any, show up on the profile. */
export const RegisterScreen = ({
  embedded = false,
  onBack,
  onSignedIn,
  onOpenLogin,
}: RegisterScreenProps) => {
  const { signUp } = useAuth();
  const [form, setForm] = useState<RegisterForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  const errors = submitted ? validate(form) : {};
  const update = (field: keyof RegisterForm) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFailure(undefined);
    if (Object.values(validate(form)).some(Boolean)) return;
    setSubmitting(true);
    try {
      await signUp({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email,
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
      onSignedIn?.();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell
      header={<BackHeader title={t('auth.createAccount')} onBack={onBack} flush={embedded} />}
    >
      <form className="vt-screen__inner" onSubmit={submit} noValidate>
        <p className="vt-body vt-text-secondary">{t('auth.registerIntro')}</p>

        {failure && (
          <InlineAlert tone="danger" title={t('auth.registerFailed')}>
            {failure}
          </InlineAlert>
        )}

        <div className="vt-stack-3">
          <TextField
            label={t('auth.firstName')}
            autoComplete="given-name"
            maxLength={MAX_NAME_LENGTH}
            value={form.firstName}
            error={errors.firstName}
            onChange={update('firstName')}
          />
          <TextField
            label={t('auth.lastName')}
            autoComplete="family-name"
            maxLength={MAX_NAME_LENGTH}
            value={form.lastName}
            error={errors.lastName}
            onChange={update('lastName')}
          />
          <TextField
            label={t('auth.email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={form.email}
            error={errors.email}
            onChange={update('email')}
          />
          <TextField
            label={t('auth.phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            optional
            maxLength={MAX_PHONE_LENGTH}
            value={form.phone}
            error={errors.phone}
            onChange={update('phone')}
          />
          <PasswordField
            label={t('auth.password')}
            autoComplete="new-password"
            maxLength={MAX_PASSWORD_LENGTH}
            hint={t('auth.passwordHint', { count: MIN_PASSWORD_LENGTH })}
            value={form.password}
            error={errors.password}
            onChange={update('password')}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          loading={submitting}
          loadingLabel={t('auth.creatingAccount')}
        >
          {t('auth.createAccount')}
        </Button>
        <Button variant="ghost" block onClick={onOpenLogin}>
          {t('auth.haveAccount')}
        </Button>
      </form>
    </ScreenShell>
  );
};
