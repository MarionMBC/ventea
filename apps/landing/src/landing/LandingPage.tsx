import type { BillingInterval } from '@ventea/shared';
import { useEffect, useState } from 'react';

import { TRIAL_DAYS } from '@/config';
import { track, trackOnce } from '@/lib/track';
import { usePlans } from '@/lib/usePlans';
import { SiteFooter } from '@/site/SiteFooter';
import { WhatsAppButton } from '@/site/WhatsAppButton';

import { Brand } from './Brand';
import { Comparison } from './Comparison';
import { Demo } from './Demo';
import { DemoRequest } from './DemoRequest';
import { Faq } from './Faq';
import { HeroArt } from './HeroArt';
import { Pricing } from './Pricing';

const STEPS = [
  {
    title: 'Crea tu cuenta',
    text: 'Elige un plan, el nombre de tu restaurante y tu dirección: turestaurante.ventea.tech. Toma dos minutos.',
  },
  {
    title: 'Carga tu menú',
    text: 'Platos, precios, fotos y extras desde tu panel. Si prefieres, te ayudamos a cargarlo.',
  },
  {
    title: 'Comparte y recibe pedidos',
    text: 'Pon tu enlace en Instagram, WhatsApp y tu local. Los pedidos llegan directo a tu cocina.',
  },
];

const FEATURES = [
  {
    icon: 'M4 6h16v12H4zM8 10h8M8 14h5',
    title: 'Pedidos web y app con tu marca',
    text: 'Tu menú en línea con tu logo y tus colores. En los planes Pro y Cadena, también tu propia app en Android y iOS.',
  },
  {
    icon: 'M12 4v8l5 3M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
    title: 'Panel de cocina en tiempo real',
    text: 'Cada pedido aparece al instante, con aviso sonoro. Tu equipo lo mueve de «preparando» a «listo» con un toque.',
  },
  {
    icon: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
    title: 'Puntos de lealtad',
    text: 'Tus clientes suman puntos con cada compra y los canjean en su próximo pedido. Vuelven más seguido.',
  },
  {
    icon: 'M5 19L19 5M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    title: '0% de comisión por pedido',
    text: 'Pagas un precio fijo al mes. Lo que vendes es tuyo, vendas diez pedidos o diez mil.',
  },
];

export function LandingPage() {
  const plans = usePlans();
  const [interval, setBillingInterval] = useState<BillingInterval>('month');
  const pro = plans.status === 'ready' ? plans.plans.find((p) => p.code === 'pro') : undefined;

  // Embudo: una visita por pestaña y cada clic en un link al registro (hero, precios, CTA…).
  useEffect(() => {
    trackOnce('visit');
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="/registro"]');
      if (link) track('cta_click');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="topbar">
        <div className="container topbar__inner">
          <Brand />
          <nav className="topbar__nav" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#funciones">Funciones</a>
            <a href="#demo">Demo</a>
            <a href="#precios">Precios</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <a className="btn btn--primary btn--sm" href="/registro">
            Empieza gratis
          </a>
        </div>
      </header>

      <main id="contenido">
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero__inner">
            <div className="hero__copy">
              <p className="eyebrow eyebrow--on-dark">
                Para restaurantes de Honduras y Latinoamérica
              </p>
              <h1 className="hero__title" id="hero-title">
                Tu restaurante con app propia, pedidos y puntos <span>— sin comisiones</span>
              </h1>
              <p className="hero__lead">
                Recibe pedidos en tu propia página y tu propia app, organiza la cocina en tiempo
                real y premia a tus clientes con puntos. Pagas un precio fijo, no un porcentaje de
                cada venta.
              </p>
              <div className="hero__actions">
                <a className="btn btn--sun btn--lg" href="/registro">
                  Prueba {TRIAL_DAYS} días gratis
                </a>
                <a className="btn btn--ghost btn--lg" href="#precios">
                  Ver precios
                </a>
              </div>
              <p className="hero__fine">Sin tarjeta · Sin permanencia · Lista en minutos</p>
            </div>
            <HeroArt />
          </div>
        </section>

        <section className="section" id="como-funciona" aria-labelledby="como-title">
          <div className="container">
            <header className="section__head">
              <p className="eyebrow">Cómo funciona</p>
              <h2 className="section__title" id="como-title">
                De cero a recibir pedidos en una tarde
              </h2>
            </header>
            <ol className="steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="step">
                  <span className="step__num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="step__title">{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section section--tint" id="funciones" aria-labelledby="funciones-title">
          <div className="container">
            <header className="section__head">
              <p className="eyebrow">Funciones</p>
              <h2 className="section__title" id="funciones-title">
                Todo lo que tu restaurante necesita para vender directo
              </h2>
            </header>
            <ul className="features">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="feature">
                  <svg
                    className="feature__icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d={feature.icon} />
                  </svg>
                  <h3 className="feature__title">{feature.title}</h3>
                  <p>{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Demo />

        <Comparison plan={pro} />

        <Pricing plans={plans} interval={interval} onIntervalChange={setBillingInterval} />

        <Faq />

        <DemoRequest />

        <section className="cta" aria-labelledby="cta-title">
          <div className="container cta__inner">
            <h2 className="cta__title" id="cta-title">
              Tu próximo pedido puede no pagar comisión.
            </h2>
            <a className="btn btn--sun btn--lg" href="/registro">
              Crear mi restaurante gratis
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
      <WhatsAppButton />
    </>
  );
}
