import type { BillingInterval, PlanCode, SignupResponse } from '@ventea/shared';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';

import { BASE_DOMAIN, CONTACT_EMAIL, TERMS_VERSION, TRIAL_DAYS } from '@/config';
import { Brand } from '@/landing/Brand';
import { IntervalToggle } from '@/landing/IntervalToggle';
import { ApiError, NETWORK_ERROR_MESSAGE, signup } from '@/lib/api';
import { formatDate, formatUsd, MIN_PASSWORD_LENGTH, priceFor, slugify } from '@/lib/format';
import { locationsLabel } from '@/lib/plans';
import { track, trackOnce } from '@/lib/track';
import { FEATURED_PLAN, usePlans } from '@/lib/usePlans';

import { PasswordField } from './PasswordField';
import { SLUG_MESSAGE, useSlugCheck } from './useSlugCheck';
import { useTenantReady, type TenantReadyStatus } from './useTenantReady';

type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
  1: 'Elige tu plan',
  2: 'Tu restaurante',
  3: 'Tu cuenta',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TERMS_ERROR =
  'Para crear tu restaurante tienes que aceptar los términos y la política de privacidad.';

/** `?plan=pro&intervalo=anual` desde la sección de precios. */
export function readInitialChoice(search: string): { plan: string; interval: BillingInterval } {
  const params = new URLSearchParams(search);
  const interval = params.get('intervalo') ?? params.get('interval');
  return {
    plan: params.get('plan') ?? FEATURED_PLAN,
    interval: interval === 'anual' || interval === 'year' ? 'year' : 'month',
  };
}

type SubmitError =
  | { kind: 'closed' }
  | { kind: 'message'; message: string; step: Step }
  /** 409 tras un intento cortado (timeout/red) con el mismo slug: quizá la creó esta persona. */
  | { kind: 'maybe-created'; adminUrl: string };

export function SignupPage({ search = window.location.search }: { search?: string }) {
  const initial = readInitialChoice(search);
  const plans = usePlans();

  const [step, setStep] = useState<Step>(1);
  const [planCode, setPlanCode] = useState<string>(initial.plan);
  const [interval, setBillingInterval] = useState<BillingInterval>(initial.interval);
  const [restaurantName, setRestaurantName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [done, setDone] = useState<SignupResponse | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Slug del último envío que se cortó sin respuesta: el servidor pudo haber creado la marca.
  const unansweredSlug = useRef<string | null>(null);
  const firstRender = useRef(true);
  const slugCheck = useSlugCheck(slug);

  useEffect(() => {
    trackOnce('signup_start');
  }, []);

  // Al cambiar de paso (o terminar) el foco va al título: el lector de pantalla anuncia
  // dónde está y el teclado sigue desde ahí.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, done]);

  const availablePlans = plans.status === 'ready' ? plans.plans : [];
  const selectedPlan = availablePlans.find((p) => p.code === planCode) ?? availablePlans[0];

  const nameError =
    restaurantName.trim().length < 2 ? 'Escribe el nombre de tu restaurante.' : undefined;
  const slugBlocking = ['empty', 'checking', 'taken', 'reserved', 'invalid'].includes(
    slugCheck.status,
  );
  const ownerNameError = ownerName.trim().length < 2 ? 'Escribe tu nombre.' : undefined;
  const emailError = EMAIL_RE.test(ownerEmail.trim())
    ? undefined
    : 'Escribe un correo válido, por ejemplo nombre@correo.com.';
  const passwordError =
    ownerPassword.length < MIN_PASSWORD_LENGTH
      ? `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      : undefined;

  const termsError = acceptedTerms ? undefined : TERMS_ERROR;

  const goTo = (next: Step) => {
    setShowErrors(false);
    setStep(next);
    if (next === 2) trackOnce('signup_step_2');
    if (next === 3) trackOnce('signup_step_3');
  };

  const onRestaurantName = (value: string) => {
    setRestaurantName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (step === 1) {
      if (selectedPlan) goTo(2);
      return;
    }
    if (step === 2) {
      if (nameError || slugBlocking) {
        setShowErrors(true);
        return;
      }
      goTo(3);
      return;
    }
    if (ownerNameError || emailError || passwordError || termsError || !selectedPlan) {
      setShowErrors(true);
      return;
    }

    setSubmitting(true);
    try {
      const response = await signup({
        restaurantName: restaurantName.trim(),
        slug,
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        planCode: selectedPlan.code as PlanCode,
        interval,
        website,
        acceptedTermsVersion: TERMS_VERSION,
      });
      setDone(response);
      track('signup_complete');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 && unansweredSlug.current === slug) {
        // El envío anterior se cortó y ahora el slug está tomado: lo más probable es que
        // sea su propia marca. No se le dice «otro restaurante».
        setSubmitError({ kind: 'maybe-created', adminUrl: `https://${slug}.${BASE_DOMAIN}/admin` });
        return;
      }
      unansweredSlug.current = status === 0 ? slug : null;
      setSubmitError(describeError(error));
      if (status === 409) {
        slugCheck.markTaken();
        goTo(2);
      } else if (error instanceof ApiError && error.status === 400 && isSlugError(error)) {
        goTo(2);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-page">
      <header className="topbar topbar--plain">
        <div className="container topbar__inner">
          <Brand />
          <a className="topbar__back" href="/">
            Volver al inicio
          </a>
        </div>
      </header>

      <main className="signup" id="contenido">
        {done ? (
          <Success
            response={done}
            restaurantName={restaurantName.trim()}
            email={ownerEmail.trim()}
            headingRef={headingRef}
          />
        ) : (
          <form
            className="signup__card"
            onSubmit={onSubmit}
            noValidate
            aria-labelledby="signup-title"
          >
            <p className="signup__kicker">Prueba {TRIAL_DAYS} días gratis · sin tarjeta</p>
            <ol className="stepper" aria-label="Pasos del registro">
              {([1, 2, 3] as Step[]).map((n) => (
                <li
                  key={n}
                  className={n === step ? 'is-current' : n < step ? 'is-done' : undefined}
                  aria-current={n === step ? 'step' : undefined}
                >
                  <span className="stepper__num" aria-hidden="true">
                    {n}
                  </span>
                  <span className="stepper__label">{STEP_TITLES[n]}</span>
                </li>
              ))}
            </ol>
            <h1 className="signup__title" id="signup-title" ref={headingRef} tabIndex={-1}>
              <span className="sr-only">Paso {step} de 3: </span>
              {STEP_TITLES[step]}
            </h1>

            {submitError?.kind === 'closed' && (
              <div className="notice notice--warn" role="alert">
                <p>
                  <strong>Registro temporalmente cerrado, escríbenos.</strong> Recibimos muchas
                  altas hoy. Escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> y
                  te abrimos tu cuenta.
                </p>
              </div>
            )}
            {submitError?.kind === 'maybe-created' && (
              <div className="notice notice--warn" role="alert">
                <p>
                  <strong>Puede que tu restaurante ya se haya creado.</strong> El envío anterior se
                  cortó antes de recibir respuesta. Intenta entrar a{' '}
                  <a href={submitError.adminUrl}>{submitError.adminUrl}</a> con tu correo y la
                  contraseña que elegiste. Si no funciona, escríbenos a{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </p>
              </div>
            )}
            {submitError?.kind === 'message' && submitError.step === step && (
              <div className="notice notice--error" role="alert">
                <p>{submitError.message}</p>
              </div>
            )}

            {step === 1 && (
              <PlanStep
                plans={plans}
                planCode={selectedPlan?.code ?? planCode}
                interval={interval}
                onPlan={setPlanCode}
                onInterval={setBillingInterval}
              />
            )}

            {step === 2 && (
              <div className="signup__fields">
                <div className="field">
                  <label className="field__label" htmlFor="restaurantName">
                    Nombre del restaurante
                  </label>
                  <input
                    id="restaurantName"
                    className="field__input"
                    name="restaurantName"
                    autoComplete="organization"
                    maxLength={80}
                    required
                    value={restaurantName}
                    aria-invalid={showErrors && nameError ? true : undefined}
                    onChange={(event) => onRestaurantName(event.target.value)}
                  />
                  {showErrors && nameError && (
                    <p className="field__error" role="alert">
                      {nameError}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="slug">
                    Dirección web
                  </label>
                  <div className="slug">
                    <span className="slug__prefix" aria-hidden="true">
                      https://
                    </span>
                    <input
                      id="slug"
                      className="field__input slug__input"
                      name="slug"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={63}
                      required
                      value={slug}
                      aria-describedby="slug-status slug-preview"
                      aria-invalid={
                        ['taken', 'reserved', 'invalid'].includes(slugCheck.status)
                          ? true
                          : undefined
                      }
                      onChange={(event) => {
                        setSlugTouched(true);
                        setSlug(event.target.value.toLowerCase().replace(/\s+/g, '-'));
                      }}
                    />
                    <span className="slug__suffix" aria-hidden="true">
                      .{BASE_DOMAIN}
                    </span>
                  </div>
                  <p
                    id="slug-status"
                    className={`slug__status slug__status--${slugCheck.status}`}
                    aria-live="polite"
                  >
                    {SLUG_MESSAGE[slugCheck.status]}
                  </p>
                  <p id="slug-preview" className="field__hint">
                    Tus clientes van a pedir en{' '}
                    <strong className="slug__preview">
                      {slug || 'tu-restaurante'}.{BASE_DOMAIN}
                    </strong>
                  </p>
                  {showErrors && slugBlocking && slugCheck.status === 'checking' && (
                    <p className="field__error" role="alert">
                      Espera un segundo: estamos revisando la dirección.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="signup__fields">
                <div className="field">
                  <label className="field__label" htmlFor="ownerName">
                    Tu nombre
                  </label>
                  <input
                    id="ownerName"
                    className="field__input"
                    name="name"
                    autoComplete="name"
                    maxLength={80}
                    required
                    value={ownerName}
                    aria-invalid={showErrors && ownerNameError ? true : undefined}
                    onChange={(event) => setOwnerName(event.target.value)}
                  />
                  {showErrors && ownerNameError && (
                    <p className="field__error" role="alert">
                      {ownerNameError}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="ownerEmail">
                    Correo
                  </label>
                  <input
                    id="ownerEmail"
                    className="field__input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={ownerEmail}
                    aria-describedby="ownerEmail-hint"
                    aria-invalid={showErrors && emailError ? true : undefined}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                  />
                  <p className="field__hint" id="ownerEmail-hint">
                    Con este correo entras al panel de tu restaurante.
                  </p>
                  {showErrors && emailError && (
                    <p className="field__error" role="alert">
                      {emailError}
                    </p>
                  )}
                </div>
                <PasswordField
                  value={ownerPassword}
                  onChange={setOwnerPassword}
                  error={showErrors ? passwordError : undefined}
                />

                <div className="field terms">
                  <div className="terms__row">
                    <input
                      id="acceptTerms"
                      className="terms__check"
                      type="checkbox"
                      name="acceptTerms"
                      checked={acceptedTerms}
                      aria-invalid={showErrors && termsError ? true : undefined}
                      aria-describedby={showErrors && termsError ? 'acceptTerms-error' : undefined}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                    />
                    <label htmlFor="acceptTerms" className="terms__label">
                      Acepto los términos y la política de privacidad
                    </label>
                  </div>
                  <p className="field__hint terms__links">
                    Léelos antes:{' '}
                    <a href="/terminos" target="_blank" rel="noopener">
                      Términos del servicio
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </a>{' '}
                    ·{' '}
                    <a href="/privacidad" target="_blank" rel="noopener">
                      Política de privacidad
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </a>
                  </p>
                  {showErrors && termsError && (
                    <p className="field__error" id="acceptTerms-error" role="alert">
                      {termsError}
                    </p>
                  )}
                </div>

                {/* Honeypot: una persona no lo ve ni llega con el teclado; un bot lo llena. */}
                <div className="hp" aria-hidden="true">
                  <label htmlFor="hp-ref">No completar</label>
                  <input
                    id="hp-ref"
                    name="hp_ref_9x"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </div>

                {selectedPlan && (
                  <p className="signup__summary">
                    Plan <strong>{selectedPlan.name}</strong>{' '}
                    {interval === 'year' ? 'anual' : 'mensual'}:{' '}
                    {formatUsd(priceFor(selectedPlan, interval))} USD al terminar la prueba. Hoy no
                    pagas nada.
                  </p>
                )}
              </div>
            )}

            <div className="signup__actions">
              {step > 1 && (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => goTo((step - 1) as Step)}
                  disabled={submitting}
                >
                  Atrás
                </button>
              )}
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || (step === 1 && !selectedPlan)}
              >
                {step < 3
                  ? 'Continuar'
                  : submitting
                    ? 'Creando tu restaurante…'
                    : 'Crear mi restaurante'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function PlanStep({
  plans,
  planCode,
  interval,
  onPlan,
  onInterval,
}: {
  plans: ReturnType<typeof usePlans>;
  planCode: string;
  interval: BillingInterval;
  onPlan: (code: string) => void;
  onInterval: (interval: BillingInterval) => void;
}) {
  if (plans.status === 'loading') {
    return <p className="signup__loading">Cargando planes…</p>;
  }
  if (plans.status === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <p>No pudimos cargar los planes. {plans.message}</p>
        <button type="button" className="btn btn--outline" onClick={plans.retry}>
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <>
      <IntervalToggle value={interval} onChange={onInterval} />
      <fieldset className="plan-pick">
        <legend className="sr-only">Plan</legend>
        {plans.plans.map((plan) => (
          <label
            key={plan.code}
            className={`plan-pick__option${plan.code === planCode ? ' is-active' : ''}`}
          >
            <input
              type="radio"
              name="planCode"
              value={plan.code}
              checked={plan.code === planCode}
              onChange={() => onPlan(plan.code)}
            />
            <span className="plan-pick__name">
              {plan.name}
              {plan.code === 'pro' && <span className="plan-pick__tag">Recomendado</span>}
            </span>
            <span className="plan-pick__meta">
              {locationsLabel(plan.maxLocations)}
              {plan.features.brandedApp ? ' · app con tu marca' : ''}
            </span>
            <span className="plan-pick__price">
              {formatUsd(priceFor(plan, interval))}
              <small> / {interval === 'year' ? 'año' : 'mes'}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

export const READY_MESSAGE: Record<TenantReadyStatus, string> = {
  checking: 'Preparando tu dirección segura… (puede tardar hasta 2 minutos)',
  ready: '¡Tu dirección ya está lista! Ya puedes entrar a tu panel.',
  slow: 'Está tardando más de lo normal. Intenta entrar en unos minutos con el botón de abajo.',
};

function Success({
  response,
  restaurantName,
  email,
  headingRef,
}: {
  response: SignupResponse;
  restaurantName: string;
  email: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const ready = useTenantReady(response.tenant.slug);
  const pageHost = response.tenant.url.replace(/^https?:\/\//, '');
  return (
    <section className="signup__card signup__done" aria-labelledby="done-title">
      <div className="done__badge" aria-hidden="true">
        ✓
      </div>
      <h1 className="signup__title" id="done-title" ref={headingRef} tabIndex={-1}>
        ¡Listo! {restaurantName} ya está en Ventea
      </h1>
      <p className={`done__notice done__notice--${ready}`} role="status">
        {READY_MESSAGE[ready]}
        {ready === 'slow' && (
          <>
            {' '}
            Si sigue sin abrir, escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            .
          </>
        )}
      </p>
      {ready === 'checking' ? (
        // Sin href hasta que la dirección tenga certificado: el clic daría un error de seguridad.
        <a
          className="btn btn--primary btn--lg btn--block is-waiting"
          role="link"
          aria-disabled="true"
        >
          <span className="spinner" aria-hidden="true" />
          Entrar a mi panel
        </a>
      ) : (
        <a className="btn btn--primary btn--lg btn--block" href={response.tenant.adminUrl}>
          Entrar a mi panel
        </a>
      )}
      <p className="done__url">{response.tenant.adminUrl}</p>
      <dl className="done__facts">
        <div>
          <dt>Tu página de pedidos</dt>
          <dd>{ready === 'checking' ? pageHost : <a href={response.tenant.url}>{pageHost}</a>}</dd>
        </div>
        <div>
          <dt>Usuario del panel</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>Tu prueba gratis termina</dt>
          <dd>{formatDate(response.trialEndsAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** 400 por la dirección: subdominio reservado o formato inválido (`issues[].path`). */
function isSlugError(error: ApiError): boolean {
  return (
    error.fields.includes('slug') ||
    error.fields.includes('restaurantName') ||
    /subdominio/i.test(error.message)
  );
}

function describeError(error: unknown): SubmitError {
  if (!(error instanceof ApiError)) {
    return { kind: 'message', message: NETWORK_ERROR_MESSAGE, step: 3 };
  }
  switch (error.status) {
    case 429:
      return { kind: 'closed' };
    case 409:
      return {
        kind: 'message',
        message: 'Esa dirección ya la tomó otro restaurante. Elige otra para continuar.',
        step: 2,
      };
    case 400:
      return isSlugError(error)
        ? {
            kind: 'message',
            message:
              error.message === 'Datos inválidos'
                ? 'Revisa el nombre y la dirección: alguno no tiene el formato correcto.'
                : `${error.message.replace(/\.$/, '')}. Elige otra dirección.`,
            step: 2,
          }
        : {
            kind: 'message',
            message:
              error.message === 'Datos inválidos'
                ? 'Revisa tus datos: algún campo no tiene el formato correcto.'
                : `Revisa tus datos: ${error.message}`,
            step: 3,
          };
    case 0:
      return { kind: 'message', message: NETWORK_ERROR_MESSAGE, step: 3 };
    default:
      return {
        kind: 'message',
        message:
          error.status >= 500
            ? 'Algo falló de nuestro lado. Intenta de nuevo en unos minutos.'
            : error.message,
        step: 3,
      };
  }
}
