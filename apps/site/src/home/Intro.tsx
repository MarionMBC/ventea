import type { Dict } from '@/i18n';
import { cssVars } from '@/style';

/** Piezas sueltas (izquierda) que se ordenan en una grilla (derecha): «complejidad → sistema». */
function IntroDiagram({ label }: { label: string }) {
  const loose: [number, number, number][] = [
    [18, 22, -14],
    [64, 8, 9],
    [30, 70, 18],
    [84, 58, -6],
    [12, 118, 7],
    [70, 112, -18],
  ];
  return (
    <svg className="intro-diagram" viewBox="0 0 360 170" role="img" aria-label={label}>
      <g className="intro-diagram__loose">
        {loose.map(([x, y, r], index) => (
          <rect
            key={index}
            x={x}
            y={y}
            width="34"
            height="22"
            rx="2"
            transform={`rotate(${r} ${x + 17} ${y + 11})`}
          />
        ))}
      </g>
      <path className="intro-diagram__arrow" d="M140 85h56m-8-7 8 7-8 7" />
      <g className="intro-diagram__system">
        {[0, 1, 2].map((row) =>
          [0, 1].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={226 + col * 66}
              y={24 + row * 44}
              width="54"
              height="30"
              rx="2"
              className={row === 1 && col === 0 ? 'accent' : undefined}
              style={cssVars({ '--i': row * 2 + col })}
            />
          )),
        )}
        <path d="M280 39h12M280 83h12M280 127h12M253 54v14M253 98v14M319 54v14M319 98v14" />
      </g>
    </svg>
  );
}

export function Intro({ t }: { t: Dict }) {
  return (
    <section className="section intro" aria-labelledby="intro-title">
      <div className="container intro__grid">
        <div className="intro__lede" data-reveal>
          <p className="eyebrow">
            <span className="eyebrow__num">01</span>
            {t.intro.eyebrow}
          </p>
          <h2 id="intro-title" className="intro__title">
            {t.intro.title}
          </h2>
        </div>
        <div className="intro__body" data-reveal>
          {t.intro.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <IntroDiagram label={t.intro.diagramLabel} />
        </div>
        <ol className="intro__points">
          {t.intro.points.map((point, index) => (
            <li key={point.title} data-reveal style={cssVars({ '--i': index })}>
              <span className="intro__point-num" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
