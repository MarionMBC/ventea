import kitchenAvif from '@/assets/demo/carolina-kitchen.avif';
import kitchenWebp from '@/assets/demo/carolina-kitchen.webp';

/**
 * Sección E — el panel del restaurante. Solo lo que el panel hace hoy (apps/admin): el tablero
 * de pedidos con su historial del día y la facturación del plan. La captura es del panel real
 * con pedidos de ejemplo (TASK-007).
 */
const FEATURES = [
  {
    title: 'Tablero de pedidos',
    text: 'Nuevos, En cocina y Listos, cada pedido con sus productos, notas y total.',
    icon: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z',
  },
  {
    title: 'Aviso de pedido nuevo',
    text: 'Sonido opcional, el pedido resaltado y el contador en la pestaña del navegador.',
    icon: 'M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0',
  },
  {
    title: 'Historial de hoy',
    text: 'Los pedidos del día ya cerrados, a mano para revisar cualquier duda.',
    icon: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  },
  {
    title: 'Su plan y su facturación',
    text: 'El dueño ve su plan, hasta cuándo dura la prueba y el estado de su suscripción.',
    icon: 'M3 7h18v10H3zM3 11h18M7 15h3',
  },
];

export function Control() {
  return (
    <section className="section section--tint control" id="panel" aria-labelledby="control-title">
      <div className="container">
        <header className="section__head" data-reveal>
          <p className="eyebrow">Control para el restaurante</p>
          <h2 className="display section__title" id="control-title">
            El control de su negocio, desde un solo lugar.
          </h2>
          <p className="section__lead">
            Un panel que su equipo entiende en minutos. Funciona en el navegador de una computadora,
            una tableta o un teléfono.
          </p>
        </header>

        <figure className="browser" data-reveal>
          <div className="browser__bar" aria-hidden="true">
            <span />
            <span />
            <span />
            <em>su-restaurante.ventea.tech/admin</em>
          </div>
          <picture>
            <source srcSet={kitchenAvif} type="image/avif" />
            <img
              src={kitchenWebp}
              width={1200}
              height={522}
              alt="Panel de pedidos de Ventea con las columnas Nuevos, En cocina y Listos, cada pedido con sus productos, notas y total."
              loading="lazy"
              decoding="async"
            />
          </picture>
          <figcaption>Captura del panel real, con pedidos de ejemplo.</figcaption>
        </figure>

        <ul className="control__features">
          {FEATURES.map((feature) => (
            <li key={feature.title} data-reveal>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d={feature.icon} />
              </svg>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
