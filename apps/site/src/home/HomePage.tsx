import { PROJECTS } from '@/content';
import type { Dict } from '@/i18n';

import { About } from './About';
import { Contact } from './Contact';
import { CtaBand } from './CtaBand';
import { Hero } from './Hero';
import { Intro } from './Intro';
import { Process } from './Process';
import { Products } from './Products';
import { Projects } from './Projects';
import { Services } from './Services';

export function HomePage({ t }: { t: Dict }) {
  return (
    <>
      <Hero t={t} />
      <Intro t={t} />
      <Services t={t} />
      <Process t={t} />
      <Products t={t} />
      <Projects t={t} projects={PROJECTS} />
      <About t={t} />
      <CtaBand t={t} />
      <Contact t={t} />
    </>
  );
}
