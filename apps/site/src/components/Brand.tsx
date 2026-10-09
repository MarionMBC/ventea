/**
 * Logo oficial de Ventea (archivos de marketing.ventea.tech copiados SIN modificar en
 * `public/brand/`). Proporción 923.8 × 157.9 (5,85:1). Variante blanca sobre navy, a color sobre
 * claro; nunca se redibuja ni se recolorea.
 */
const RATIO = 923.8 / 157.9;

export function Logo({
  variant,
  height = 26,
  className,
}: {
  variant: 'color' | 'white';
  height?: number;
  className?: string;
}) {
  const src = variant === 'white' ? '/brand/logo-white.svg' : '/brand/logo-horizontal.svg';
  return (
    <img
      className={className}
      src={src}
      alt=""
      width={Math.round(height * RATIO)}
      height={height}
      decoding="async"
    />
  );
}
