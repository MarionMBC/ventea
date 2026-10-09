import { useState } from 'react';

import { TRIAL_DAYS } from '@/config';
import { signupHref, useLocale, useT } from '@/i18n';

import { useReducedMotion, useSequence } from './motion';
import { SAMPLE_ORDER, ShotPhone, usd, type AppShot } from './shots';

/**
 * Coreografía del hero con capturas reales de la app de Carolina: inicio, platillo, estado del
 * pedido (y el pedido llega al restaurante) y puntos. Cuatro pasos que avanzan solos (pausables; con movimiento reducido
 * quedan quietos y se avanzan a mano). Los CTA no se mueven nunca.
 */
const SCREENS: AppShot[] = ['home', 'product', 'tracking', 'profile'];

const STEP_MS = 2600;

export function Hero() {
  const t = useT();
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const playing = !reduced && !paused;
  const [step, setStep] = useSequence(SCREENS.length, STEP_MS, playing);

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
          <ShotPhone screens={SCREENS} active={SCREENS[step]} eager className="hero__phone" />

          <div className="hero__ticket" aria-hidden="true">
            <p className="hero__ticket-head">
              <span className="dot" /> {t.hero.ticketNew} · #{SAMPLE_ORDER.code}
            </p>
            <p>
              {t.hero.ticketTakeout} · {usd(SAMPLE_ORDER.totalCents)}
            </p>
            <p className="hero__ticket-fee">
              {t.hero.ticketFee} <strong>{usd(0)}</strong>
            </p>
          </div>
          <div className="hero__points" aria-hidden="true">
            <span>★</span> {t.hero.pointsBadge(SAMPLE_ORDER.earnedPoints)}
          </div>

          <div className="hero__controls">
            <ol className="hero__steps" aria-label={t.hero.stepsLabel}>
              {SCREENS.map((_s, index) => (
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
