/**
 * CSV de las tablas de reportes, armado en el navegador con los datos ya agregados.
 *
 * - Formato según el idioma del panel: en inglés `,` y punto decimal; en español `;` y coma
 *   decimal, que es lo que Excel en configuración regional hispana abre en columnas y lee como
 *   números (con `,` lo deja todo en una columna). Sin línea `sep=`: Excel la acepta, pero
 *   entonces ignora el BOM y rompe los acentos.
 * - Comillas dobles cuando hace falta y BOM UTF-8.
 * - Celdas de texto que empiezan con `=`, `+`, `-`, `@`, tab o retorno se prefijan con `'`: un
 *   nombre de producto como `=HYPERLINK(...)` no se ejecuta como fórmula al abrirlo (CSV
 *   injection). Los números van como número (un monto negativo sigue siendo número).
 */
/** Marca de orden de bytes: Excel la necesita para leer UTF-8 (acentos). */
const BOM = String.fromCharCode(0xfeff);

export type CsvCell = string | number;

export interface CsvFormat {
  separator: ',' | ';';
  decimal: '.' | ',';
}

export const CSV_EN: CsvFormat = { separator: ',', decimal: '.' };
export const CSV_ES: CsvFormat = { separator: ';', decimal: ',' };

export function csvFormat(lang: string): CsvFormat {
  return lang === 'es' ? CSV_ES : CSV_EN;
}

function cell(value: CsvCell, format: CsvFormat): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value).replace('.', format.decimal) : '';
  }
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const special = new RegExp(`["\\r\\n${format.separator}]`);
  return special.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly CsvCell[])[], format: CsvFormat = CSV_EN): string {
  const lines = rows.map((row) => row.map((value) => cell(value, format)).join(format.separator));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Descarga un CSV con un enlace temporal (sin abrir otra pestaña). */
export function downloadCsv(
  filename: string,
  rows: readonly (readonly CsvCell[])[],
  format: CsvFormat = CSV_EN,
): void {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows, format)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
