import { useEffect, useRef } from 'react';

import type { Dict } from '@/i18n';
import { cssVars } from '@/style';

interface Module {
  id: keyof Dict['hero']['modules'];
  x: number;
  y: number;
  w: number;
  h: number;
  /** Desde dónde llega al ensamblarse (px del viewBox). */
  from: [number, number];
  accent?: boolean;
}

/** Composición propia (TASK-009): canales arriba, núcleo al centro, datos y servicios abajo. */
const MODULES: readonly Module[] = [
  { id: 'web', x: 40, y: 40, w: 120, h: 44, from: [-40, -30] },
  { id: 'mobile', x: 240, y: 40, w: 120, h: 44, from: [0, -44] },
  { id: 'partners', x: 440, y: 40, w: 120, h: 44, from: [40, -30] },
  { id: 'core', x: 150, y: 196, w: 300, h: 64, from: [0, 0], accent: true },
  { id: 'ai', x: 480, y: 206, w: 100, h: 44, from: [44, 0] },
  { id: 'data', x: 60, y: 380, w: 120, h: 44, from: [-40, 30] },
  { id: 'events', x: 240, y: 380, w: 120, h: 44, from: [0, 44] },
  { id: 'payments', x: 420, y: 380, w: 120, h: 44, from: [40, 30] },
];

/** Conectores ortogonales (bus superior, núcleo, bus inferior, IA). `pathLength=1` para dibujarlos. */
const LINKS: readonly string[] = [
  'M100 84V140H500V84',
  'M300 84V196',
  'M450 228H480',
  'M300 260V320',
  'M120 380V320H480V380',
  'M300 320V380',
];

const NODES: readonly [number, number][] = [
  [300, 140],
  [300, 320],
  [465, 228],
];

/**
 * Hero: arquitectura modular que se ensambla (~1,2 s, solo CSS: funciona antes de hidratar) y
 * responde al puntero con un parallax sutil de tres capas (solo puntero fino, escritorio y sin
 * reduced-motion). El texto del hero no depende de esto: es el LCP y está en el HTML.
 */
export function HeroArt({ t }: { t: Dict }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    const hero = svg?.closest<HTMLElement>('.hero');
    if (!svg || !hero || !window.matchMedia) return;
    const query = window.matchMedia(
      '(pointer: fine) and (min-width: 1080px) and (prefers-reduced-motion: no-preference)',
    );
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      svg.style.setProperty('--px', x.toFixed(3));
      svg.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      if (!query.matches) return;
      const box = hero.getBoundingClientRect();
      x = ((event.clientX - box.left) / box.width - 0.5) * 2;
      y = ((event.clientY - box.top) / box.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className="hero-art"
      viewBox="0 0 600 464"
      role="img"
      aria-labelledby="hero-art-title"
      focusable="false"
    >
      <title id="hero-art-title">{t.hero.artLabel}</title>
      <defs>
        <pattern id="hero-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" className="hero-art__grid-line" />
        </pattern>
      </defs>
      <g className="hero-art__layer hero-art__layer--back">
        <rect
          className="hero-art__field"
          x="0"
          y="0"
          width="600"
          height="464"
          fill="url(#hero-grid)"
        />
        <path
          className="hero-art__frame"
          d="M8 20V8H20M580 8H592V20M592 444V456H580M20 456H8V444"
        />
      </g>
      <g className="hero-art__layer hero-art__layer--mid">
        {LINKS.map((d, index) => (
          <g key={d}>
            <path
              className="hero-art__link"
              d={d}
              pathLength={1}
              style={{ animationDelay: `${420 + index * 70}ms` }}
            />
            <path
              className="hero-art__flow"
              d={d}
              pathLength={1}
              style={{ animationDelay: `${1600 + index * 380}ms` }}
            />
          </g>
        ))}
        {NODES.map(([cx, cy], index) => (
          <circle
            key={`${cx}-${cy}`}
            className="hero-art__node"
            cx={cx}
            cy={cy}
            r="4"
            style={{ animationDelay: `${1000 + index * 80}ms` }}
          />
        ))}
      </g>
      <g className="hero-art__layer hero-art__layer--front">
        {MODULES.map((module, index) => (
          <g
            key={module.id}
            className={`hero-art__module${module.accent ? ' hero-art__module--core' : ''}`}
            style={{
              animationDelay: module.accent ? '120ms' : `${300 + index * 90}ms`,
              ...cssVars({ '--fx': `${module.from[0]}px`, '--fy': `${module.from[1]}px` }),
            }}
          >
            <rect x={module.x} y={module.y} width={module.w} height={module.h} rx="3" />
            <circle className="hero-art__tick" cx={module.x + 10} cy={module.y + 10} r="2" />
            <text
              x={module.x + module.w / 2}
              y={module.y + module.h / 2}
              dy="0.35em"
              textAnchor="middle"
            >
              {t.hero.modules[module.id]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
