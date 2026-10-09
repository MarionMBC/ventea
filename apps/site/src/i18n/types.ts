/**
 * Forma del diccionario del sitio (TASK-009). `es.ts` y `en.ts` la implementan completa: el
 * compilador obliga a tener las mismas claves y `i18n.test.ts` verifica además que los arreglos
 * tengan el mismo largo (un servicio o una fase de más en un idioma es un error).
 */

export type Locale = 'es' | 'en';

export type ServiceId = 'software' | 'apps' | 'ai' | 'architecture' | 'saas';
export type ProjectTypeId = ServiceId | 'other';

/** Anclas de la home: cambian con el idioma (`#servicios` / `#services`). */
export interface Anchors {
  services: string;
  solutions: string;
  process: string;
  about: string;
  projects: string;
  contact: string;
}

export interface PageMeta {
  title: string;
  description: string;
}

export interface ServiceCopy {
  id: ServiceId;
  title: string;
  /** Beneficio en una línea. */
  summary: string;
  body: string;
  includes: readonly string[];
  fit: string;
  cta: string;
}

export interface PhaseCopy {
  title: string;
  text: string;
  deliverables: readonly string[];
}

export interface TitledText {
  title: string;
  text: string;
}

export interface Shot {
  alt: string;
  caption: string;
}

export interface PlanCopy {
  name: string;
  price: string;
  detail: string;
}

export interface Dict {
  locale: Locale;
  /** `og:locale`. */
  ogLocale: string;
  meta: {
    home: PageMeta;
    privacy: PageMeta;
    notFound: PageMeta;
    ogImageAlt: string;
    /** Nombre del `ProfessionalService` del JSON-LD. */
    serviceName: string;
  };
  anchors: Anchors;
  a11y: {
    skip: string;
    mainNav: string;
    footerNav: string;
    home: string;
    openMenu: string;
    closeMenu: string;
    newTab: string;
  };
  nav: {
    services: string;
    solutions: string;
    process: string;
    about: string;
    projects: string;
    contact: string;
    cta: string;
  };
  lang: {
    /** Código visible del otro idioma (EN / ES). */
    otherShort: string;
    /** Nombre accesible del link al otro idioma. */
    otherLabel: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    primary: string;
    secondary: string;
    tagline: string;
    artLabel: string;
    modules: {
      web: string;
      mobile: string;
      partners: string;
      core: string;
      ai: string;
      data: string;
      payments: string;
      events: string;
    };
  };
  intro: {
    eyebrow: string;
    title: string;
    paragraphs: readonly string[];
    points: readonly TitledText[];
    diagramLabel: string;
  };
  services: {
    eyebrow: string;
    title: string;
    lead: string;
    includesLabel: string;
    fitLabel: string;
    items: readonly ServiceCopy[];
  };
  process: {
    eyebrow: string;
    title: string;
    lead: string;
    deliverablesLabel: string;
    phases: readonly PhaseCopy[];
  };
  products: {
    eyebrow: string;
    title: string;
    lead: string;
    marketing: {
      kicker: string;
      name: string;
      summary: string;
      features: readonly string[];
      flowTitle: string;
      flow: readonly string[];
      plansTitle: string;
      plans: readonly PlanCopy[];
      plansNote: string;
      languageNote: string;
      cta: string;
      pricingCta: string;
      shot: Shot;
    };
    restaurants: {
      kicker: string;
      name: string;
      summary: string;
      features: readonly string[];
      facts: readonly TitledText[];
      languageNote: string;
      cta: string;
      kitchen: Shot;
      menu: Shot;
    };
  };
  projects: {
    eyebrow: string;
    title: string;
    lead: string;
  };
  about: {
    eyebrow: string;
    title: string;
    paragraphs: readonly string[];
    principlesTitle: string;
    principles: readonly TitledText[];
    stackTitle: string;
    stackNote: string;
  };
  cta: {
    eyebrow: string;
    title: string;
    text: string;
    button: string;
  };
  contact: {
    eyebrow: string;
    title: string;
    lead: string;
    directTitle: string;
    directText: string;
    form: {
      name: string;
      company: string;
      optional: string;
      email: string;
      projectType: string;
      choose: string;
      message: string;
      messageHint: string;
      /** `{count}` y `{max}` se reemplazan. */
      counter: string;
      honeypot: string;
      submit: string;
      note: string;
      errorsSummary: string;
    };
    projectTypes: Readonly<Record<ProjectTypeId, string>>;
    errors: {
      name: string;
      email: string;
      emailInvalid: string;
      projectType: string;
      message: string;
    };
    status: {
      opening: string;
      openedTitle: string;
      openedText: string;
      copy: string;
      copied: string;
      copyFailed: string;
      writeDirect: string;
      previewLabel: string;
    };
    mail: {
      /** `{type}` y `{who}` se reemplazan. */
      subject: string;
      name: string;
      company: string;
      email: string;
      projectType: string;
      to: string;
      subjectLabel: string;
    };
  };
  footer: {
    tagline: string;
    navTitle: string;
    servicesTitle: string;
    productsTitle: string;
    contactTitle: string;
    privacy: string;
    rights: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    lead: string;
    sections: readonly { title: string; paragraphs: readonly string[] }[];
    productTitle: string;
    productText: string;
    back: string;
  };
  notFound: {
    eyebrow: string;
    title: string;
    text: string;
    productText: string;
    back: string;
  };
}
