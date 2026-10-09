import type { BillingInterval } from '@ventea/shared';
import { useEffect, useState } from 'react';

import { useT } from '@/i18n';
import { track, trackOnce } from '@/lib/track';
import { usePlans } from '@/lib/usePlans';
import { SiteFooter } from '@/site/SiteFooter';
import { SiteHeader } from '@/site/SiteHeader';
import { WhatsAppButton } from '@/site/WhatsAppButton';

import { Control } from './Control';
import { DemoRequest } from './DemoRequest';
import { DirectOrders } from './DirectOrders';
import { Faq } from './Faq';
import { FinalCta } from './FinalCta';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { Identity } from './Identity';
import { Journey } from './Journey';
import { Loyalty } from './Loyalty';
import { useRevealOnScroll } from './motion';
import { OwnBrand } from './OwnBrand';
import { Pricing } from './Pricing';

/**
 * Landing de app.ventea.tech (TASK-010). El recorrido cuenta el producto en el orden en que lo
 * vive el restaurante: su marca, la experiencia del cliente, el pedido que llega a la cocina, los
 * puntos, el panel, cómo empezar, la diferencia, los precios y las dudas.
 */
export function LandingPage() {
  const t = useT();
  const plans = usePlans();
  const [interval, setBillingInterval] = useState<BillingInterval>('month');
  useRevealOnScroll();

  // Embudo: una visita por pestaña y cada clic en un link al registro (hero, precios, CTA…), en
  // los dos idiomas: `/signup` (inglés) y `/registro` (español).
  useEffect(() => {
    trackOnce('visit');
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.(
        'a[href^="/registro"], a[href^="/signup"]',
      );
      if (link) track('cta_click');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      <a className="skip-link" href="#contenido">
        {t.common.skipToContent}
      </a>
      <SiteHeader />

      <main id="contenido">
        <Hero />
        <OwnBrand />
        <Journey />
        <DirectOrders />
        <Loyalty />
        <Control />
        <HowItWorks />
        <Identity />
        <Pricing plans={plans} interval={interval} onIntervalChange={setBillingInterval} />
        <Faq />
        <DemoRequest />
        <FinalCta />
      </main>

      <SiteFooter />
      <WhatsAppButton />
    </>
  );
}
