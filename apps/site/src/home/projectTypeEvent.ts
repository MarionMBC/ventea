import type { ProjectTypeId } from '@/i18n/types';

/**
 * El CTA de cada servicio lleva al formulario con el tipo de proyecto ya elegido. Evento del
 * documento (no estado global): el formulario lo escucha y solo lo aplica si el campo está vacío.
 */
export const PROJECT_TYPE_EVENT = 'ventea:project-type';

export function selectProjectType(id: ProjectTypeId): void {
  document.dispatchEvent(new CustomEvent<ProjectTypeId>(PROJECT_TYPE_EVENT, { detail: id }));
}
