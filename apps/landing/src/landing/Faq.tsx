import { CONTACT_EMAIL, TRIAL_DAYS } from '@/config';

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: `¿La prueba de ${TRIAL_DAYS} días es gratis de verdad?`,
    a: `Sí. Creas tu restaurante sin tarjeta y usas todo el plan que elegiste durante ${TRIAL_DAYS} días. Si no te convence, no pagas nada.`,
  },
  {
    q: '¿Cómo se paga?',
    a: 'Los planes se pagan en dólares (USD), mes a mes o por año. El pago anual equivale a diez meses: te regalamos dos. Antes de que termine tu prueba te avisamos cómo activar tu plan.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí. No hay permanencia ni multas. Si cancelas, tu servicio sigue funcionando hasta el final del período que ya pagaste.',
  },
  {
    q: '¿De verdad no cobran comisión por pedido?',
    a: 'Así es: 0% por pedido. Pagas solo el precio fijo de tu plan. Si cobras con tarjeta a través de un procesador de pagos, su comisión es aparte y la pactas tú con él.',
  },
  {
    q: '¿Necesito saber de tecnología?',
    a: 'No. Tu dirección queda activa en un par de minutos y cargas el menú desde tu panel. Si te trabas, te ayudamos por correo.',
  },
  {
    q: '¿Cómo funciona la app con mi marca?',
    a: 'En los planes Pro y Cadena preparamos tu app para Android y iOS con tu logo y tus colores. Tus clientes la descargan y piden directo a tu restaurante.',
  },
];

export function Faq() {
  return (
    <section className="section" id="preguntas" aria-labelledby="preguntas-title">
      <div className="container container--narrow">
        <header className="section__head">
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2 className="section__title" id="preguntas-title">
            Lo que suelen preguntarnos
          </h2>
        </header>
        <div className="faq">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="faq__item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
        <p className="faq__more">
          ¿Otra pregunta? Escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </section>
  );
}
