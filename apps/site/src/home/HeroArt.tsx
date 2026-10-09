/**
 * Ilustración del hero: un diagrama de arquitectura genérico (clientes → API → servicios →
 * datos). SVG propio, liviano y decorativo (`aria-hidden`); colores desde los tokens.
 */
function Box({
  x,
  y,
  w,
  label,
  accent = false,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={40}
        rx={8}
        className={accent ? 'art__box art__box--accent' : 'art__box'}
      />
      <text x={x + w / 2} y={y + 25} textAnchor="middle" className="art__label">
        {label}
      </text>
    </g>
  );
}

export function HeroArt() {
  return (
    <svg className="hero__art" viewBox="0 0 440 360" aria-hidden="true" focusable="false">
      <g className="art__wires">
        <path d="M75 70v40h145v30M220 70v70M365 70v40H220" />
        <path d="M220 180v30M85 210h270M85 210v30M220 210v30M355 210v30" />
        <path d="M85 280v26M220 280v26" />
        <path d="M355 280v26" className="art__wire--dashed" />
      </g>
      <Box x={20} y={30} w={110} label="web app" />
      <Box x={165} y={30} w={110} label="mobile app" />
      <Box x={310} y={30} w={110} label="partners" />
      <Box x={110} y={140} w={220} label="api · auth · tenants" accent />
      <Box x={30} y={240} w={110} label="orders" />
      <Box x={165} y={240} w={110} label="billing" />
      <Box x={300} y={240} w={110} label="integrations" />
      <g className="art__db">
        <path d="M45 312c0-6 18-10 40-10s40 4 40 10v26c0 6-18 10-40 10s-40-4-40-10z" />
        <path d="M45 312c0 6 18 10 40 10s40-4 40-10" className="art__line" />
      </g>
      <g className="art__db">
        <rect x={180} y={306} width={80} height={40} rx={8} />
        <path d="M196 320h48M196 332h32" className="art__line" />
      </g>
      <g className="art__db art__db--muted">
        <rect x={315} y={306} width={80} height={40} rx={8} />
        <path d="M340 326l10 8 18-16" className="art__line" />
      </g>
      <circle cx={220} cy={140} r={4} className="art__dot" />
      <circle cx={220} cy={210} r={4} className="art__dot" />
    </svg>
  );
}
