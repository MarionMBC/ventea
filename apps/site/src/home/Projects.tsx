import type { Project } from '@/content';
import type { Dict } from '@/i18n';

/**
 * Casos de clientes. Componente listo, pero con la lista vacía NO se renderiza (ni la sección ni
 * su link en la navegación): no se publican ejemplos ficticios.
 */
export function Projects({ t, projects }: { t: Dict; projects: readonly Project[] }) {
  if (projects.length === 0) return null;
  return (
    <section className="section projects" id={t.anchors.projects} aria-labelledby="projects-title">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="eyebrow">{t.projects.eyebrow}</p>
          <h2 id="projects-title" className="section-title">
            {t.projects.title}
          </h2>
          <p className="section-lead">{t.projects.lead}</p>
        </header>
        <ul className="projects__list">
          {projects.map((project) => (
            <li key={project.id} className="project" data-reveal>
              <p className="project__client">{project.client}</p>
              <h3>{project.title[t.locale]}</h3>
              <p>{project.summary[t.locale]}</p>
              <p className="project__services">{project.services.join(' · ')}</p>
              {project.url ? (
                <a href={project.url}>{project.url.replace(/^https?:\/\//, '')}</a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
