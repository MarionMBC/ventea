/** Logotipo: isotipo SVG + nombre. Enlaza al inicio. */
export function Brand({ href = '/' }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label="Ventea, inicio">
      <svg className="brand__mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect width="64" height="64" rx="16" fill="currentColor" />
        <path d="M16 18h9l7 20 7-20h9L37 48h-10z" fill="var(--sun)" />
      </svg>
      <span className="brand__name">Ventea</span>
    </a>
  );
}
