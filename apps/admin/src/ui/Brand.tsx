import type { PublicTenant } from '@ventea/shared';

/** Nombre visible de la marca del tenant (o Ventea mientras carga). */
export function brandName(tenant: PublicTenant | undefined): string {
  return tenant?.branding.appDisplayName ?? tenant?.name ?? 'Ventea';
}

/** Logo de la marca o, sin logo, su inicial sobre el color de la marca. */
export function BrandMark({
  tenant,
  size = 40,
}: {
  tenant: PublicTenant | undefined;
  size?: number;
}) {
  const name = brandName(tenant);
  if (tenant?.branding.logoUrl) {
    return (
      <img
        className="brand-mark brand-mark--logo"
        src={tenant.branding.logoUrl}
        alt=""
        width={size}
        height={size}
      />
    );
  }
  return (
    <span
      className="brand-mark"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || 'V'}
    </span>
  );
}
