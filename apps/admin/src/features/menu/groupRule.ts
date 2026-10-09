import type { I18n } from '@/i18n';

/** Regla de un grupo de modificadores en palabras: «Elige 1», «Opcional, hasta 3», «Elige de 1 a 3». */
export function groupRule(group: { minSelect: number; maxSelect: number }, t: I18n['t']): string {
  const { minSelect: min, maxSelect: max } = group;
  if (min === 0) return t('group.ruleOptional', { count: max });
  if (min === max) return t('group.ruleExactly', { count: min });
  return t('group.ruleRange', { min, max });
}
