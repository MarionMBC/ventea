/**
 * Datos del sitio que no dependen del idioma (TASK-009). Los textos viven en `i18n/`.
 */

/** Tecnologías que usamos de verdad (las del propio monorepo y los productos de Ventea). */
export const STACK: readonly string[] = [
  'TypeScript',
  'Node.js',
  'NestJS',
  'React',
  'Flutter',
  'Capacitor',
  'PostgreSQL',
  'Docker',
  'CI/CD',
];

/**
 * Caso de cliente publicado. Solo con autorización del cliente y con hechos verificables: sin
 * cifras ni testimonios inventados.
 */
export interface Project {
  id: string;
  client: string;
  title: { es: string; en: string };
  summary: { es: string; en: string };
  services: readonly string[];
  url?: string;
}

/**
 * Hoy no hay casos publicables (decisión del usuario, TASK-008/009): la lista va vacía y la
 * sección «Proyectos» y su link en la navegación no se renderizan.
 */
export const PROJECTS: readonly Project[] = [];
