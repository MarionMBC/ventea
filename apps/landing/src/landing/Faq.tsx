import { CONTACT_EMAIL, TRIAL_DAYS } from '@/config';

import { REWARDS } from './food';

/**
 * Preguntas frecuentes, con respuestas alineadas al producto y a los términos: sin delivery ni
 * pago en línea (hoy se paga al retirar), puntos con la configuración inicial real y el pago
 * del plan coordinado con el equipo. `<details>` nativo: teclado y lectores sin JS.
 */
export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: '¿Cómo funciona Ventea?',
    a: 'Registra su restaurante, cargamos su menú con usted y sus clientes piden desde la experiencia con su marca. Los pedidos llegan al tablero de su cocina, su equipo los avanza de «Nuevos» a «En cocina» y «Listos», y cada pedido entregado le suma puntos al cliente.',
  },
  {
    q: '¿Qué significa tener una app propia?',
    a: 'Que su cliente pide en una experiencia con el nombre, el logo y los colores de su restaurante, no en una lista junto a otros. Todos los planes incluyen su dirección propia en ventea.tech; en los planes Pro y Cadena preparamos además su app para Android y iOS con su marca.',
  },
  {
    q: '¿Cómo reciben los pedidos los restaurantes?',
    a: 'En el panel de pedidos, desde el navegador de una computadora, tableta o teléfono. Cada pedido nuevo aparece solo, resaltado y con aviso sonoro si lo activa. Hoy los pedidos son para llevar o para comer en el local, y el cliente paga al retirar; no hay delivery ni pago en línea dentro de Ventea.',
  },
  {
    q: '¿Cómo funcionan los puntos?',
    a: `Con la configuración inicial, su cliente gana 1 punto por cada unidad de moneda del pedido (1 punto por lempira) cuando el pedido se entrega, más ${REWARDS.welcomeBonus} puntos de bienvenida al crear su cuenta. Puede canjearlos desde ${REWARDS.minToRedeem} puntos como descuento en un pedido; cada punto vale 1 centavo. Si un pedido se cancela, los puntos canjeados vuelven a su saldo.`,
  },
  {
    q: '¿Existen comisiones por pedido?',
    a: 'No. Ventea no cobra comisión por pedido: paga solo la tarifa fija de su plan, venda lo que venda. Si en el futuro cobra con tarjeta a través de un procesador de pagos, la comisión de ese procesador es aparte y la pacta usted con él.',
  },
  {
    q: '¿Qué costos tiene el servicio?',
    a: `El precio de su plan, en dólares (USD), mes a mes o por año; el pago anual equivale a diez meses. Sin costo de instalación ni permanencia. Todos los planes empiezan con ${TRIAL_DAYS} días gratis, sin tarjeta. Hoy el pago se coordina con nuestro equipo: en la sección Facturación de su panel ve hasta cuándo dura su prueba, y para activar su plan nos escribe y coordinamos el pago con usted.`,
  },
  {
    q: '¿Cómo empieza el registro?',
    a: 'En tres pasos: elige su plan, escribe el nombre de su restaurante y su dirección (su-restaurante.ventea.tech), y crea su cuenta. Su panel queda listo al momento y la dirección se activa en uno o dos minutos.',
  },
  {
    q: '¿Qué dispositivos se necesitan?',
    a: 'Para el panel, cualquier computadora, tableta o teléfono con un navegador actualizado y conexión a internet. Sus clientes piden desde su teléfono.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí, desde la sección Facturación de su panel. No hay permanencia ni multas. Si cancela, su servicio sigue funcionando hasta el final del período que ya pagó.',
  },
];

export function Faq() {
  return (
    <section className="section faq-section" id="preguntas" aria-labelledby="preguntas-title">
      <div className="container faq-layout">
        <header className="faq-layout__head" data-reveal>
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2 className="display section__title" id="preguntas-title">
            Lo que suelen preguntarnos
          </h2>
          <p className="section__lead">
            ¿Otra pregunta? Escríbanos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </header>
        <div className="faq">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="faq__item">
              <summary>
                {q}
                <span className="faq__icon" aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
