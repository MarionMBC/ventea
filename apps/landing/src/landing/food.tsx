import bowl320a from '@/assets/food/bowl-320.avif';
import bowl320w from '@/assets/food/bowl-320.webp';
import bowl720a from '@/assets/food/bowl-720.avif';
import bowl720w from '@/assets/food/bowl-720.webp';
import burger320a from '@/assets/food/burger-320.avif';
import burger320w from '@/assets/food/burger-320.webp';
import burger720a from '@/assets/food/burger-720.avif';
import burger720w from '@/assets/food/burger-720.webp';
import chicken320a from '@/assets/food/chicken-320.avif';
import chicken320w from '@/assets/food/chicken-320.webp';
import chicken720a from '@/assets/food/chicken-720.avif';
import chicken720w from '@/assets/food/chicken-720.webp';
import poke320a from '@/assets/food/poke-320.avif';
import poke320w from '@/assets/food/poke-320.webp';
import poke720a from '@/assets/food/poke-720.avif';
import poke720w from '@/assets/food/poke-720.webp';
import tacos320a from '@/assets/food/tacos-320.avif';
import tacos320w from '@/assets/food/tacos-320.webp';
import tacos720a from '@/assets/food/tacos-720.avif';
import tacos720w from '@/assets/food/tacos-720.webp';
import wings320a from '@/assets/food/wings-320.avif';
import wings320w from '@/assets/food/wings-320.webp';
import wings720a from '@/assets/food/wings-720.avif';
import wings720w from '@/assets/food/wings-720.webp';

/**
 * Fotografía gastronómica de la landing (TASK-010). Fotos de Unsplash con la Unsplash License
 * (uso comercial permitido, sin atribución obligatoria; ver docs/landing-photo-credits.md),
 * recortadas a cuadrado en 320 y 720 px, AVIF + WebP. Ilustran el restaurante de ejemplo de
 * las demostraciones: no son de ningún cliente de Ventea.
 */
export type Dish = 'burger' | 'chicken' | 'tacos' | 'bowl' | 'poke' | 'wings';

const SOURCES: Record<Dish, { a320: string; w320: string; a720: string; w720: string }> = {
  burger: { a320: burger320a, w320: burger320w, a720: burger720a, w720: burger720w },
  chicken: { a320: chicken320a, w320: chicken320w, a720: chicken720a, w720: chicken720w },
  tacos: { a320: tacos320a, w320: tacos320w, a720: tacos720a, w720: tacos720w },
  bowl: { a320: bowl320a, w320: bowl320w, a720: bowl720a, w720: bowl720w },
  poke: { a320: poke320a, w320: poke320w, a720: poke720a, w720: poke720w },
  wings: { a320: wings320a, w320: wings320w, a720: wings720a, w720: wings720w },
};

/** Foto cuadrada con `srcset` 320/720. `sizes` = ancho mostrado. */
export function DishPhoto({
  dish,
  alt = '',
  sizes,
  eager = false,
  className,
}: {
  dish: Dish;
  alt?: string;
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  const s = SOURCES[dish];
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={`${s.a320} 320w, ${s.a720} 720w`} sizes={sizes} />
      <img
        src={s.w320}
        srcSet={`${s.w320} 320w, ${s.w720} 720w`}
        sizes={sizes}
        width={320}
        height={320}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  );
}

/**
 * Restaurante de ejemplo de las demostraciones. Ficticio y presentado como tal en la página.
 * Precios en lempiras: las marcas nuevas se crean en HNL (región hn-1).
 */
export const DEMO_RESTAURANT = {
  name: 'Casa Brasa',
  initials: 'CB',
  address: 'casa-brasa.ventea.tech',
  orderNumber: 'CB-1042',
} as const;

/** Platos del menú de ejemplo. Nombre y detalle, por idioma, en `t.menu[dish]`. */
export type MenuDish = 'burger' | 'tacos' | 'chicken' | 'bowl';

export const DEMO_MENU: { dish: MenuDish; price: number }[] = [
  { dish: 'burger', price: 245 },
  { dish: 'tacos', price: 160 },
  { dish: 'chicken', price: 210 },
  { dish: 'bowl', price: 185 },
];

/** El pedido de ejemplo: hamburguesa + tacos. */
export const DEMO_ORDER = [DEMO_MENU[0]!, DEMO_MENU[1]!];
export const DEMO_TOTAL = DEMO_ORDER.reduce((sum, item) => sum + item.price, 0);

/**
 * Puntos con la configuración inicial real de cada marca (DEFAULT_REWARD_PROGRAM de
 * @ventea/shared): 1 punto por lempira, 1 punto = 1 centavo al canjear, canje desde 100 puntos
 * y 50 de bienvenida.
 */
export const REWARDS = {
  pointsPerUnit: 1,
  centsPerPoint: 1,
  minToRedeem: 100,
  welcomeBonus: 50,
} as const;
export const DEMO_EARNED = Math.floor(DEMO_TOTAL * REWARDS.pointsPerUnit);
export const DEMO_BALANCE = REWARDS.welcomeBonus + DEMO_EARNED;

/**
 * Monto en lempiras: `L 405.00`. Igual en los dos idiomas (en-US y es-HN agrupan con coma y usan
 * punto decimal), así el prerender y el cliente coinciden.
 */
export function lempiras(amount: number): string {
  return `L ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
