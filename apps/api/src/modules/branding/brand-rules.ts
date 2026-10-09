import {
  textContrastOn,
  WCAG_AA_NORMAL,
  type AppPublisher,
  type BrandWarning,
  type PlanCode,
} from '@ventea/shared';

/**
 * Reglas de Mi marca y de la app por marca (TASK-016), lógica pura.
 */

/**
 * Bundle id por defecto: `app.ventea.<slug sin guiones>`. Un segmento de Android no puede
 * empezar con dígito: un slug como `24-horas` queda `app.ventea.t24horas`.
 */
export function defaultBundleId(slug: string): string {
  const segment = slug.replace(/-/g, '');
  return `app.ventea.${/^[0-9]/.test(segment) ? `t${segment}` : segment}`;
}

/**
 * Quién publica en las tiendas por defecto (ADR 0008): Cadena, en la cuenta del cliente (la
 * app sale a nombre de la marca); Pro (y cualquier otro), en la cuenta de Ventea.
 */
export function defaultPublisher(planCode: PlanCode | null): AppPublisher {
  return planCode === 'chain' ? 'client' : 'ventea';
}

type ColorField = BrandWarning['field'];

/**
 * Advertencias de contraste AA (no bloquean): el texto blanco (el de los botones de la marca)
 * no llega a 4.5:1 sobre el color. Se recomienda el que sí llega; si ninguno llegara (no pasa
 * con WCAG 2: el mejor de los dos da ≥ 4.58:1) igual se avisa. El panel las muestra al guardar.
 */
export function brandWarnings(colors: Partial<Record<ColorField, string | null>>): BrandWarning[] {
  const warnings: BrandWarning[] = [];
  for (const field of ['primaryColor', 'secondaryColor', 'accentColor'] as const) {
    const color = colors[field];
    if (!color) continue;
    let contrast: ReturnType<typeof textContrastOn>;
    try {
      contrast = textContrastOn(color);
    } catch {
      continue; // color heredado con otra forma: no es tarea de esta advertencia
    }
    if (contrast.white >= WCAG_AA_NORMAL) continue;
    const blackWorks = contrast.black >= WCAG_AA_NORMAL;
    warnings.push({
      field,
      whiteRatio: round(contrast.white),
      blackRatio: round(contrast.black),
      recommendedTextColor: blackWorks ? 'black' : 'white',
      message:
        `El texto blanco sobre ${color} se lee mal (${round(contrast.white)}:1; el mínimo es 4.5:1). ` +
        (blackWorks
          ? `Usa texto negro (${round(contrast.black)}:1) o un tono más oscuro.`
          : 'Prueba un tono más oscuro o más claro.'),
    });
  }
  return warnings;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
