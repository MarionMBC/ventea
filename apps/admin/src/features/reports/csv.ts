/**
 * CSV de las tablas de reportes, armado en el navegador con los datos ya agregados.
 *
 * - Separador coma, comillas dobles cuando hace falta y BOM UTF-8 (Excel lo abre con acentos).
 * - Celdas que empiezan con `=`, `+`, `-`, `@`, tab o retorno se prefijan con `'`: un nombre de
 *   producto como `=HYPERLINK(...)` no se ejecuta como fórmula al abrirlo (CSV injection).
 *   Los números van tal cual (un monto negativo sigue siendo número).
 */
export type CsvCell = string | number;

function cell(value: CsvCell): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** Descarga un CSV con un enlace temporal (sin abrir otra pestaña). */
export function downloadCsv(filename: string, rows: readonly (readonly CsvCell[])[]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
