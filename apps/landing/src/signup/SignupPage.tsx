import type { BillingInterval, PlanCode, SignupResponse } from '@ventea/shared';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';

import { BASE_DOMAIN, CONTACT_EMAIL, TERMS_VERSION, TRIAL_DAYS } from '@/config';
import { useIntlLocale, useT, type Messages } from '@/i18n';
import { IntervalToggle } from '@/landing/IntervalToggle';
import { ApiError, signup } from '@/lib/api';
import { formatDate, formatUsd, MIN_PASSWORD_LENGTH, priceFor, slugify } from '@/lib/format';
import { locationsLabel, planName } from '@/lib/plans';
import { trackOnce } from '@/lib/track';
import { FEATURED_PLAN, usePlans } from '@/lib/usePlans';
import { PlainHeader } from '@/site/PlainHeader';

import { PasswordField } from './PasswordField';
import { useSlugCheck } from './useSlugCheck';
import { useTenantReady } from './useTenantReady';

type Step = 1 | 2 | 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Plan e intervalo de la URL. El contrato de siempre es `/registro?plan=pro&intervalo=anual`
 * (enlaces existentes y redirects del apex); en inglés, `/signup?plan=pro&interval=annual`. Se
 * aceptan los dos nombres y los dos idiomas en cualquiera de las dos rutas.
 */
export function readInitialChoice(search: string): { plan: string; interval: BillingInterval } {
  const params = new URLSearchParams(search);
  const interval = (params.get('intervalo') ?? params.get('interval') ?? '').toLowerCase();
  return {
    plan: params.get('plan') ?? FEATURED_PLAN,
    interval: ['anual', 'annual', 'year', 'yearly'].includes(interval) ? 'year' : 'month',
  };
}

type SubmitError =
  | { kind: 'closed' }
  | { kind: 'message'; message: string; step: Step }
  /** 409 tras un intento cortado (timeout/red) con el mismo slug: quizá la creó esta persona. */
  | { kind: 'maybe-created'; adminUrl: string };

export function SignupPage({ search = window.location.search }: { search?: string }) {
  const t = useT();
  const s = t.signup;
  const intl = useIntlLocale();
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

  const nameError = restaurantName.trim().length < 2 ? s.errors.name : undefined;
  const slugBlocking = ['empty', 'checking', 'taken', 'reserved', 'invalid'].includes(
    slugCheck.status,
  );
  const ownerNameError = ownerName.trim().length < 2 ? s.errors.owner : undefined;
  const emailError = EMAIL_RE.test(ownerEmail.trim()) ? undefined : s.errors.email;
  const passwordError =
    ownerPassword.length < MIN_PASSWORD_LENGTH ? s.errors.password(MIN_PASSWORD_LENGTH) : undefined;

  const termsError = acceptedTerms ? undefined : s.errors.terms;

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
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 409 && unansweredSlug.current === slug) {
        // El envío anterior se cortó y ahora el slug está tomado: lo más probable es que
        // sea su propia marca. No se le dice «otro restaurante».
        setSubmitError({ kind: 'maybe-created', adminUrl: `https://${slug}.${BASE_DOMAIN}/admin` });
        return;
      }
      unansweredSlug.current = status === 0 ? slug : null;
      setSubmitError(describeError(error, t));
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

  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

  return (
    <div className="signup-page">
      <PlainHeader search={search} />

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
            <p className="signup__kicker">{s.kicker(TRIAL_DAYS)}</p>
            <ol className="stepper" aria-label={s.stepperLabel}>
              {([1, 2, 3] as Step[]).map((n) => (
                <li
                  key={n}
                  className={n === step ? 'is-current' : n < step ? 'is-done' : undefined}
                  aria-current={n === step ? 'step' : undefined}
                >
                  <span className="stepper__num" aria-hidden="true">
                    {n}
                  </span>
                  <span className="stepper__label">{s.stepTitles[n - 1]}</span>
                </li>
              ))}
            </ol>
            <h1 className="signup__title" id="signup-title" ref={headingRef} tabIndex={-1}>
              <span className="sr-only">{s.stepOf(step)}</span>
              {s.stepTitles[step - 1]}
            </h1>

            {submitError?.kind === 'closed' && (
              <div className="notice notice--warn" role="alert">
                <p>
                  <strong>{s.closedStrong}</strong>
                  {s.closedBefore}
                  {mail}
                  {s.closedAfter}
                </p>
              </div>
            )}
            {submitError?.kind === 'maybe-created' && (
              <div className="notice notice--warn" role="alert">
                <p>
                  <strong>{s.maybeCreatedStrong}</strong>
                  {s.maybeCreatedBefore}
                  <a href={submitError.adminUrl}>{submitError.adminUrl}</a>
                  {s.maybeCreatedMiddle}
                  {mail}.
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
                    {s.restaurantName}
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
                    {s.slugLabel}
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
                    {s.slug[slugCheck.status]}
                  </p>
                  <p id="slug-preview" className="field__hint">
                    {s.slugPreviewBefore}
                    <strong className="slug__preview">
                      {slug || s.slugPlaceholder}.{BASE_DOMAIN}
                    </strong>
                  </p>
                  {showErrors && slugBlocking && slugCheck.status === 'checking' && (
                    <p className="field__error" role="alert">
                      {s.slugChecking}
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="signup__fields">
                <div className="field">
                  <label className="field__label" htmlFor="ownerName">
                    {s.ownerName}
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
                    {s.email}
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
                    {s.emailHint}
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
                      {s.acceptTerms}
                    </label>
                  </div>
                  <p className="field__hint terms__links">
                    {s.readFirst}
                    <a href="/terminos" target="_blank" rel="noopener" hrefLang="es">
                      {s.termsLink}
                      <span className="sr-only">{s.newTab}</span>
                    </a>{' '}
                    ·{' '}
                    <a href="/privacidad" target="_blank" rel="noopener" hrefLang="es">
                      {s.privacyLink}
                      <span className="sr-only">{s.newTab}</span>
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
                  <label htmlFor="hp-ref">{s.honeypot}</label>
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
                    {s.summaryBefore}
                    <strong>{planName(selectedPlan, t)}</strong>
                    {s.summaryAfter(interval, formatUsd(priceFor(selectedPlan, interval), intl))}
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
                  {s.back}
                </button>
              )}
              <button
                type="submit"
                className="btn btn--primary"
                disabled={submitting || (step === 1 && !selectedPlan)}
              >
                {step < 3 ? s.continue : submitting ? s.creating : s.create}
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
  const t = useT();
  const s = t.signup;
  const intl = useIntlLocale();
  if (plans.status === 'loading') {
    return <p className="signup__loading">{s.loadingPlans}</p>;
  }
  if (plans.status === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <p>
          {s.plansError} {t.common.apiDetail(plans.message, plans.httpStatus)}
        </p>
        <button type="button" className="btn btn--outline" onClick={plans.retry}>
          {t.common.retry}
        </button>
      </div>
    );
  }
  return (
    <>
      <IntervalToggle value={interval} onChange={onInterval} />
      <fieldset className="plan-pick">
        <legend className="sr-only">{s.planLegend}</legend>
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
              {planName(plan, t)}
              {plan.code === 'pro' && (
                <span className="plan-pick__tag">{t.pricing.recommended}</span>
              )}
            </span>
            <span className="plan-pick__meta">
              {locationsLabel(plan.maxLocations, t)}
              {plan.features.brandedApp ? s.brandedApp : ''}
            </span>
            <span className="plan-pick__price">
              {formatUsd(priceFor(plan, interval), intl)}
              <small> / {s.per[interval]}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

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
  const s = useT().signup;
  const intl = useIntlLocale();
  const ready = useTenantReady(response.tenant.slug);
  const pageHost = response.tenant.url.replace(/^https?:\/\//, '');
  return (
    <section className="signup__card signup__done" aria-labelledby="done-title">
      <div className="done__badge" aria-hidden="true">
        ✓
      </div>
      <h1 className="signup__title" id="done-title" ref={headingRef} tabIndex={-1}>
        {s.doneTitle(restaurantName)}
      </h1>
      <p className={`done__notice done__notice--${ready}`} role="status">
        {s.ready[ready]}
        {ready === 'slow' && (
          <>
            {s.slowBefore}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
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
          {s.enterPanel}
        </a>
      ) : (
        <a className="btn btn--primary btn--lg btn--block" href={response.tenant.adminUrl}>
          {s.enterPanel}
        </a>
      )}
      <p className="done__url">{response.tenant.adminUrl}</p>
      <dl className="done__facts">
        <div>
          <dt>{s.pageLabel}</dt>
          <dd>{ready === 'checking' ? pageHost : <a href={response.tenant.url}>{pageHost}</a>}</dd>
        </div>
        <div>
          <dt>{s.userLabel}</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>{s.trialEnds}</dt>
          <dd>{formatDate(response.trialEndsAt, intl)}</dd>
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

/**
 * Error del registro en el idioma de la vista. Los mensajes de la API vienen en español: en
 * español se muestran tal cual (como antes); en inglés, uno propio.
 */
function describeError(error: unknown, t: Messages): SubmitError {
  const e = t.signup.errors;
  if (!(error instanceof ApiError)) {
    return { kind: 'message', message: t.common.networkError, step: 3 };
  }
  switch (error.status) {
    case 429:
      return { kind: 'closed' };
    case 409:
      return { kind: 'message', message: e.taken, step: 2 };
    case 400:
      return isSlugError(error)
        ? {
            kind: 'message',
            message: error.message === 'Datos inválidos' ? e.slugInvalid : e.slugApi(error.message),
            step: 2,
          }
        : {
            kind: 'message',
            message: error.message === 'Datos inválidos' ? e.dataInvalid : e.dataApi(error.message),
            step: 3,
          };
    case 0:
      return { kind: 'message', message: t.common.networkError, step: 3 };
    default:
      return {
        kind: 'message',
        message: error.status >= 500 ? e.server : e.other(error.message, error.status),
        step: 3,
      };
  }
}
