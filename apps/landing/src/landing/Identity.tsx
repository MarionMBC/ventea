import menuAvif from '@/assets/demo/carolina-menu.avif';
import menuWebp from '@/assets/demo/carolina-menu.webp';
import profileAvif from '@/assets/demo/carolina-profile.avif';
import profileWebp from '@/assets/demo/carolina-profile.webp';

/**
 * Sección G — la diferencia, con el producto real: capturas de la app de Carolina Hot Chicken,
 * la primera marca en Ventea (menú y perfil con puntos; el correo de la cuenta de prueba está
 * tapado). Sin testimonios ni cifras.
 */
const PILLARS = [
  {
    n: '01',
    title: 'Identidad',
    text: 'Su logo, sus colores y sus fotos. Para el cliente, la app es de su restaurante.',
  },
  {
    n: '02',
    title: 'Pedidos directos',
    text: 'El pedido va de su cliente a su cocina, y el pago se hace en su local.',
  },
  {
    n: '03',
    title: 'Fidelización',
    text: 'Puntos propios que solo se ganan y se canjean en su restaurante.',
  },
];

export function Identity() {
  return (
    <section className="section identity" id="identidad" aria-labelledby="identity-title">
      <div className="container identity__inner">
        <div className="identity__copy">
          <header data-reveal>
            <p className="eyebrow">Diferenciación</p>
            <h2 className="display section__title" id="identity-title">
              Una experiencia digital que lleva el nombre de su restaurante.
            </h2>
          </header>
          <ol className="pillars">
            {PILLARS.map((pillar) => (
              <li key={pillar.n} data-reveal>
                <span className="pillars__n" aria-hidden="true">
                  {pillar.n}
                </span>
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </li>
            ))}
          </ol>
        </div>

        <figure className="identity__shots" data-reveal>
          <div className="shot shot--menu">
            <picture>
              <source srcSet={menuAvif} type="image/avif" />
              <img
                src={menuWebp}
                width={520}
                height={1126}
                alt="Menú en la app de Carolina Hot Chicken: categorías, un combo con descuento y productos con foto y precio."
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <div className="shot shot--profile">
            <picture>
              <source srcSet={profileAvif} type="image/avif" />
              <img
                src={profileWebp}
                width={520}
                height={480}
                alt="Perfil de un cliente en la app de Carolina Hot Chicken con 62 puntos y su historial: bono de bienvenida y puntos por un pedido."
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <figcaption>
            Carolina Hot Chicken ya recibe pedidos con Ventea. Capturas de su app, con su marca.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
