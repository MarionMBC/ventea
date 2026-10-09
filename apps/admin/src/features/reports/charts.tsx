import { useId, useState, type ReactNode } from 'react';

import { useI18n } from '@/i18n';

import { downloadCsv, type CsvCell } from './csv';

/**
 * Gráficos de reportes sin dependencias (TASK-023): barras en SVG con `viewBox` estirable y los
 * textos en HTML (no se deforman ni se achican en el teléfono). Cada gráfico tiene nombre y un
 * resumen accesible, y su tabla con los mismos datos a un clic (y en CSV).
 */

export interface ChartPoint {
  key: string;
  /** Texto completo (tooltip, tabla). */
  label: string;
  /** Etiqueta corta del eje. */
  short: string;
  value: number;
  display: string;
}

/** Tope del eje: 1, 2 o 5 × 10ⁿ por encima del máximo (el eje se lee en números redondos). */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * power >= max) return step * power;
  return 10 * power;
}

/** Cada cuántas barras va una etiqueta del eje X: como mucho ~8 visibles. */
export function labelEvery(count: number): number {
  return Math.max(1, Math.ceil(count / 8));
}

/** Columnas verticales (series en el tiempo, horas del día). */
export function ColumnChart({
  points,
  summary,
  formatAxis,
}: {
  points: readonly ChartPoint[];
  summary: string;
  formatAxis: (value: number) => string;
}) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const width = Math.max(points.length, 1) * 10;
  const every = labelEvery(points.length);
  return (
    <div className="chart">
      <div className="chart__y" aria-hidden="true">
        <span>{formatAxis(max)}</span>
        <span>{formatAxis(max / 2)}</span>
        <span>{formatAxis(0)}</span>
      </div>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
      >
        {[0, 50, 100].map((y) => (
          <line
            key={y}
            className="chart__grid"
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points.map((point, index) => {
          const height = (point.value / max) * 100;
          return (
            <rect
              key={point.key}
              className="chart__bar"
              x={index * 10 + 1.5}
              width={7}
              y={100 - height}
              height={height}
            >
              <title>{`${point.label}: ${point.display}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="chart__x" aria-hidden="true">
        {points.map((point, index) =>
          index % every === 0 ? (
            <span
              key={point.key}
              className="chart__tick"
              style={{ left: `${((index + 0.5) / points.length) * 100}%` }}
            >
              {point.short}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Barras horizontales con su texto (estados, productos): se leen solas, sin eje. */
export function BarList({ points }: { points: readonly ChartPoint[] }) {
  const max = Math.max(0, ...points.map((p) => p.value)) || 1;
  return (
    <ul className="barlist">
      {points.map((point) => (
        <li key={point.key} className="barlist__row">
          <span className="barlist__label">{point.label}</span>
          <span className="barlist__value">{point.display}</span>
          <span className="barlist__track" aria-hidden="true">
            <span className="barlist__fill" style={{ width: `${(point.value / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface TableColumn {
  header: string;
  numeric?: boolean;
}

/**
 * Tarjeta de un gráfico: título, nota, «Gráfico / Tabla» y CSV. La tabla es la alternativa
 * accesible y exacta del gráfico; el CSV baja esas mismas filas (valores en bruto: centavos
 * convertidos a unidades con punto decimal).
 */
export function ChartCard({
  title,
  note,
  columns,
  rows,
  csvRows,
  filename,
  empty,
  children,
  wide = false,
}: {
  title: string;
  note?: string;
  columns: readonly TableColumn[];
  /** Filas de la tabla, ya formateadas. */
  rows: readonly (readonly ReactNode[])[];
  /** Filas del CSV, sin formato (con encabezado aparte). */
  csvRows: readonly (readonly CsvCell[])[];
  filename: string;
  empty?: string | null;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <article className={`card chart-card${wide ? ' chart-card--wide' : ''}`} aria-labelledby={id}>
      <div className="chart-card__head">
        <div className="chart-card__titles">
          <h2 id={id}>{title}</h2>
          {note && <p className="chart-card__note">{note}</p>}
        </div>
        <div className="chart-card__tools">
          <div
            className="segmented chart-card__view"
            role="group"
            aria-label={t('reports.view', { name: title })}
          >
            {(['chart', 'table'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`segmented__item${view === value ? ' active' : ''}`}
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {value === 'chart' ? t('reports.chart') : t('reports.table')}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-label={t('reports.csvAria', { name: title })}
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(filename, [columns.map((column) => column.header), ...csvRows])
            }
          >
            {t('reports.csv')}
          </button>
        </div>
      </div>

      {empty ? (
        <p className="chart-card__empty">{empty}</p>
      ) : view === 'chart' ? (
        children
      ) : (
        <div className="report-table-wrap">
          <table className="report-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.header}
                    scope="col"
                    className={column.numeric ? 'num' : undefined}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((value, col) =>
                    col === 0 ? (
                      <th key={col} scope="row">
                        {value}
                      </th>
                    ) : (
                      <td key={col} className={columns[col]?.numeric ? 'num' : undefined}>
                        {value}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
