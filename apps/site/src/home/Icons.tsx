import type { IconName } from '@/content';

/** Iconos lineales propios (24×24, trazo), decorativos: siempre `aria-hidden`. */
const PATHS: Record<IconName, string> = {
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16',
  mobile:
    'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM10.5 18.5h3',
  architecture: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
  saas: 'M4 5h16v10H4zM8 19h8M12 15v4M7.5 9h3M7.5 12h6',
  plug: 'M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21',
  ops: 'M4 6h16v5H4zM4 13h16v5H4zM7.5 8.5h.01M7.5 15.5h.01M11 8.5h5M11 15.5h5',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Check() {
  return (
    <svg
      className="check"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

/** Logo: «V» de dos trazos con nodos (grafo), igual que el favicon. */
export function Logo({ className = 'logo' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="var(--logo-bg)" />
      <path
        d="M17 20l15 25 15-25"
        fill="none"
        stroke="var(--accent-bright)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="20" r="5.5" fill="#f6f7f9" />
      <circle cx="47" cy="20" r="5.5" fill="#f6f7f9" />
      <circle cx="32" cy="45" r="5.5" fill="#f6f7f9" />
    </svg>
  );
}
