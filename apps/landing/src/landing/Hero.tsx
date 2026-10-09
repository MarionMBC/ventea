import { useState } from 'react';

import { TRIAL_DAYS } from '@/config';

import { DEMO_EARNED, DEMO_RESTAURANT, DEMO_TOTAL, DishPhoto, lempiras } from './food';
import { useReducedMotion, useSequence } from './motion';
import { Phone, type PhoneScreen } from './Phone';

/**
 * Coreografía del hero: el cliente abre el menú, agrega, confirma, el pedido llega al
 * restaurante y suma puntos. Cinco pasos que avanzan solos (pausables; con movimiento reducido
 * quedan quietos y se avanzan a mano). Los CTA no se mueven nunca.
 */
const STEPS: { screen: PhoneScreen; added: boolean; label: string }[] = [
  { screen: 'menu', added: false, label: 'Menú' },
  { screen: 'menu', added: true, label: 'Agregar' },
  { screen: 'cart', added: true, label: 'Confirmar' },
  { screen: 'confirmed', added: true, label: 'En la cocina' },
  { screen: 'points', added: true, label: 'Puntos' },
];

const STEP_MS = 2600;

export function Hero() {
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
          <p className="eyebrow eyebrow--on-dark hero__eyebrow">
            La plataforma digital para su restaurante
          </p>
          <h1 className="hero__title" id="hero-title">
            <span className="hero__line">
              <span>Su restaurante.</span>
            </span>{' '}
            <span className="hero__line">
              <span>Su propia app.</span>
            </span>{' '}
            <span className="hero__line hero__line--accent">
              <span>Sus propios clientes.</span>
            </span>
          </h1>
          <p className="hero__lead">
            Reciba pedidos directos, recompense a sus clientes con puntos y fortalezca su marca
            desde una experiencia digital propia.
          </p>
          <p className="hero__fee">
            <strong>0% de comisión por pedido.</strong> Paga una tarifa fija mensual o anual, venda
            lo que venda.
          </p>
          <div className="hero__actions">
            <a className="btn btn--sun btn--lg" href="/registro">
              Registrar mi restaurante
            </a>
            <a className="btn btn--ghost btn--lg" href="#como-funciona">
              Ver cómo funciona
            </a>
          </div>
          <p className="hero__fine">
            {TRIAL_DAYS} días de prueba gratis · Sin tarjeta · Sin permanencia
          </p>
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
              <span className="dot" /> Pedido nuevo · #{DEMO_RESTAURANT.orderNumber}
            </p>
            <p>Para llevar · {lempiras(DEMO_TOTAL)}</p>
            <p className="hero__ticket-fee">
              Comisión Ventea <strong>L 0.00</strong>
            </p>
          </div>
          <div className="hero__points" aria-hidden="true">
            <span>★</span> +{DEMO_EARNED} puntos
          </div>

          <div className="hero__controls">
            <ol className="hero__steps" aria-label="Pasos de la demostración">
              {STEPS.map((s, index) => (
                <li key={s.label}>
                  <button
                    type="button"
                    className="hero__step"
                    aria-current={index === step ? 'step' : undefined}
                    onClick={() => {
                      setStep(index);
                      setPaused(true);
                    }}
                  >
                    <span className="sr-only">Paso {index + 1}: </span>
                    {s.label}
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
                {paused ? 'Reproducir' : 'Pausar'}
                <span className="sr-only"> la demostración</span>
              </button>
            )}
          </div>
          <p className="hero__disclaimer">Demostración con un restaurante de ejemplo.</p>
        </div>
      </div>
    </section>
  );
}
