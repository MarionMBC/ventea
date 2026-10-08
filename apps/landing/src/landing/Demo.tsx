import kitchenAvif from '@/assets/demo/carolina-kitchen.avif';
import kitchenWebp from '@/assets/demo/carolina-kitchen.webp';
import menuAvif from '@/assets/demo/carolina-menu.avif';
import menuWebp from '@/assets/demo/carolina-menu.webp';
import profileAvif from '@/assets/demo/carolina-profile.avif';
import profileWebp from '@/assets/demo/carolina-profile.webp';
import { DEMO_URL } from '@/config';

interface Shot {
  avif: string;
  webp: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  kind: 'phone' | 'wide';
}

/**
 * Capturas del producto real (TASK-007), sin testimonios ni cifras inventadas. La app de
 * Carolina Hot Chicken (menú y perfil con puntos; el correo de la cuenta de prueba está tapado)
 * y el panel de cocina con pedidos de ejemplo. Tamaños fijos = sin saltos de layout.
 */
const SHOTS: Shot[] = [
  {
    avif: kitchenAvif,
    webp: kitchenWebp,
    width: 1200,
    height: 522,
    alt: 'Panel de cocina de Ventea con pedidos en las columnas Nuevos, En cocina y Listos, cada uno con sus productos, notas y total.',
    caption:
      'Panel de cocina: los pedidos entran solos y tu equipo los pasa de «Nuevos» a «En cocina» y «Listos». (Pedidos de ejemplo.)',
    kind: 'wide',
  },
  {
    avif: menuAvif,
    webp: menuWebp,
    width: 520,
    height: 1126,
    alt: 'Menú en la app de Carolina Hot Chicken: categorías, un combo con descuento y productos con foto y precio.',
    caption: 'El menú en la app de Carolina, con su marca, sus fotos y sus combos.',
    kind: 'phone',
  },
  {
    avif: profileAvif,
    webp: profileWebp,
    width: 520,
    height: 480,
    alt: 'Perfil de un cliente en la app de Carolina Hot Chicken con 62 puntos y su historial: bono de bienvenida y puntos por un pedido.',
    caption: 'Cada cliente ve sus puntos y cómo los ganó.',
    kind: 'phone',
  },
];

export function Demo() {
  return (
    <section className="section demo" id="demo" aria-labelledby="demo-title">
      <div className="container">
        <header className="section__head">
          <p className="eyebrow">Así se ve</p>
          <h2 className="section__title" id="demo-title">
            Mírala funcionando
          </h2>
          <p className="section__lead">
            Capturas del producto real. Carolina Hot Chicken ya recibe pedidos con Ventea.
          </p>
        </header>

        <div className="demo__grid">
          {SHOTS.map((shot) => (
            <figure key={shot.webp} className={`demo__shot demo__shot--${shot.kind}`}>
              <div className="demo__frame">
                <picture>
                  <source srcSet={shot.avif} type="image/avif" />
                  <img
                    src={shot.webp}
                    width={shot.width}
                    height={shot.height}
                    alt={shot.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </div>
              <figcaption>{shot.caption}</figcaption>
            </figure>
          ))}
        </div>

        <div className="demo__live">
          <p>
            ¿Quieres verla como la ven tus clientes? Entra a una tienda de ejemplo y recorre el
            menú.
          </p>
          <a className="btn btn--outline" href={DEMO_URL} target="_blank" rel="noopener noreferrer">
            Ver una demo en vivo
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
