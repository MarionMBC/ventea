import { useState } from 'react';

import { TRIAL_DAYS } from '@/config';
import { signupHref, useLocale, useT } from '@/i18n';

import { DEMO_EARNED, DEMO_RESTAURANT, DEMO_TOTAL, DishPhoto, lempiras } from './food';
import { useReducedMotion, useSequence } from './motion';
import { Phone, type PhoneScreen } from './Phone';

/**
 * Coreografía del hero: el cliente abre el menú, agrega, confirma, el pedido llega al
 * restaurante y suma puntos. Cinco pasos que avanzan solos (pausables; con movimiento reducido
 * quedan quietos y se avanzan a mano). Los CTA no se mueven nunca.
 */
const STEPS: { screen: PhoneScreen; added: boolean }[] = [
  { screen: 'menu', added: false },
  { screen: 'menu', added: true },
  { screen: 'cart', added: true },
  { screen: 'confirmed', added: true },
  { screen: 'points', added: true },
];

const STEP_MS = 2600;

export function Hero() {
  const t = useT();
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const playing = !reduced && !paused;
  const [step, setStep] = useSequence(STEPS.length, STEP_MS, playing);
  const current = STEPS[step]!;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="eyebrow eyebrow--on-dark hero__eyebrow">{t.hero.eyebrow}</p>
          <h1 className="hero__title" id="hero-title">
            <span className="hero__line">
              <span>{t.hero.titleLines[0]}</span>
            </span>{' '}
            <span className="hero__line">
              <span>{t.hero.titleLines[1]}</span>
            </span>{' '}
            <span className="hero__line hero__line--accent">
              <span>{t.hero.titleLines[2]}</span>
            </span>
          </h1>
          <p className="hero__lead">{t.hero.lead}</p>
          <p className="hero__fee">
            <strong>{t.hero.feeStrong}</strong> {t.hero.feeRest}
          </p>
          <div className="hero__actions">
            <a className="btn btn--sun btn--lg" href={signupHref(locale)}>
              {t.hero.primaryCta}
            </a>
            <a className="btn btn--ghost btn--lg" href="#como-funciona">
              {t.hero.secondaryCta}
            </a>
          </div>
          <p className="hero__fine">{t.hero.fine(TRIAL_DAYS)}</p>
        </div>

        <div className="hero__stage" data-step={step}>
          <figure className="hero__dish hero__dish--a" aria-hidden="true">
            <DishPhoto dish="burger" sizes="(min-width: 1024px) 220px, 140px" eager />
          </figure>
          <figure className="hero__dish hero__dish--b" aria-hidden="true">
            <DishPhoto dish="tacos" sizes="(min-width: 1024px) 160px, 110px" eager />
          </figure>

          <Phone screen={current.screen} added={current.added} eager className="hero__phone" />

          <div className="hero__ticket" aria-hidden="true">
            <p className="hero__ticket-head">
              <span className="dot" /> {t.hero.ticketNew} · #{DEMO_RESTAURANT.orderNumber}
            </p>
            <p>
              {t.hero.ticketTakeout} · {lempiras(DEMO_TOTAL)}
            </p>
            <p className="hero__ticket-fee">
              {t.hero.ticketFee} <strong>{lempiras(0)}</strong>
            </p>
          </div>
          <div className="hero__points" aria-hidden="true">
            <span>★</span> {t.hero.pointsBadge(DEMO_EARNED)}
          </div>

          <div className="hero__controls">
            <ol className="hero__steps" aria-label={t.hero.stepsLabel}>
              {STEPS.map((_s, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className="hero__step"
                    aria-current={index === step ? 'step' : undefined}
                    onClick={() => {
                      setStep(index);
                      setPaused(true);
                    }}
                  >
                    <span className="sr-only">{t.hero.stepPrefix(index + 1)}</span>
                    {t.hero.steps[index]}
                  </button>
                </li>
              ))}
            </ol>
            {!reduced && (
              <button
                type="button"
                className="hero__pause"
                aria-pressed={paused}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? t.hero.play : t.hero.pause}
                <span className="sr-only">{t.hero.controlSuffix}</span>
              </button>
            )}
          </div>
          <p className="hero__disclaimer">{t.hero.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}
