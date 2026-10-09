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
  lazy = false,
}: {
  variant: 'color' | 'white';
  height?: number;
  className?: string;
  /** Para la variante que arranca oculta: sin precarga ni descarga hasta que se muestra. */
  lazy?: boolean;
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
      loading={lazy ? 'lazy' : undefined}
    />
  );
}
