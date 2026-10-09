import type { Dict } from './types';

/**
 * English. Same content rule as Spanish: nothing invented (no clients, testimonials, figures,
 * certifications, team or absolute promises). Ventea Marketing facts come from
 * https://marketing.ventea.tech (brand-research, 2026-10-08); that product is in Spanish.
 */
export const en: Dict = {
  locale: 'en',
  ogLocale: 'en_US',
  meta: {
    home: {
      title: 'Ventea · Custom software development and software architecture',
      description:
        'We design, build and connect software for companies: custom software, web and mobile apps, artificial intelligence and automation, architecture and integrations, and SaaS platforms.',
    },
    privacy: {
      title: 'Privacy policy · Ventea',
      description:
        'This site does not use cookies or third-party analytics. The contact form only opens your email app with a pre-filled message.',
    },
    notFound: {
      title: 'Page not found · Ventea',
      description:
        'The page you are looking for does not exist. Go back to Ventea: software engineering and digital architecture.',
    },
    ogImageAlt: 'Ventea · Software & Architecture: software engineering and digital architecture.',
    serviceName: 'Ventea — software development and software architecture',
  },
  anchors: {
    services: 'services',
    solutions: 'solutions',
    process: 'process',
    about: 'about',
    projects: 'projects',
    contact: 'contact',
  },
  a11y: {
    skip: 'Skip to content',
    mainNav: 'Main',
    footerNav: 'Footer',
    home: 'Ventea, home',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    newTab: '(opens in a new tab)',
  },
  nav: {
    services: 'Services',
    solutions: 'Solutions',
    process: 'Process',
    about: 'About',
    projects: 'Projects',
    contact: 'Contact',
    cta: 'Request a proposal',
  },
  lang: {
    otherShort: 'ES',
    otherLabel: 'Versión en español',
  },
  hero: {
    eyebrow: 'Software engineering & digital architecture',
    title: 'We build the software that powers what’s next.',
    lead: 'We design, build and connect digital solutions that change the way companies operate.',
    primary: 'Let’s talk about your project',
    secondary: 'Explore solutions',
    tagline: 'Engineered for what’s next',
    artLabel:
      'Diagram of a modular architecture: web, mobile and partner channels connected to an API core, with AI, data, payments and events.',
    modules: {
      web: 'web',
      mobile: 'mobile',
      partners: 'partners',
      core: 'api · auth · domain',
      ai: 'ai',
      data: 'data',
      payments: 'payments',
      events: 'events',
    },
  },
  intro: {
    eyebrow: 'Approach',
    title: 'Technology should solve problems, not create them.',
    paragraphs: [
      'Every company comes with something concrete: processes that live in spreadsheets, systems that do not talk to each other, a product idea that has to get off on the right foot.',
      'Ventea turns those challenges into software you can run and grow. First we understand the business, then we design the architecture, and only then do we build.',
    ],
    points: [
      {
        title: 'Understand',
        text: 'Which problem is worth solving first and how the result will be measured.',
      },
      {
        title: 'Design',
        text: 'A written architecture, with its trade-offs and risks, before any code.',
      },
      {
        title: 'Build',
        text: 'Working software early on, with automated tests and deployments.',
      },
    ],
    diagramLabel: 'Illustration: loose pieces arranged into a system.',
  },
  services: {
    eyebrow: 'Services',
    title: 'What we design and build',
    lead: 'From a single integration to a complete platform. Each service can be hired on its own.',
    includesLabel: 'Includes',
    fitLabel: 'Good fit for',
    items: [
      {
        id: 'software',
        title: 'Custom software',
        summary: 'Systems built around the way your company works, not the other way around.',
        body: 'Internal systems, portals and back offices that replace spreadsheets and manual work, with documented API contracts and automated tests on every change.',
        includes: [
          'Internal systems: inventory, operations and reporting',
          'Customer and supplier portals',
          'APIs with documented contracts',
        ],
        fit: 'Teams that outgrew their spreadsheets or an off-the-shelf tool that no longer fits.',
        cta: 'Let’s talk about your system',
      },
      {
        id: 'apps',
        title: 'Web and mobile apps',
        summary: 'Digital products your customers and your team use every day.',
        body: 'Web applications, dashboards and Android and iOS apps from a single cross-platform codebase, published under your brand.',
        includes: [
          'Web applications and management dashboards',
          'Cross-platform Android and iOS apps (Flutter or Capacitor)',
          'Store publishing and release management',
        ],
        fit: 'Businesses that want their own app instead of depending on someone else’s.',
        cta: 'Let’s talk about your app',
      },
      {
        id: 'ai',
        title: 'Artificial intelligence and automation',
        summary: 'Language models and automations inside your processes, with human oversight.',
        body: 'We integrate large language models (LLMs) where they help: classifying, summarizing, drafting or extracting data from documents, with a person reviewing the result. And we automate repetitive work across your tools. We use it in our own product, Ventea Marketing.',
        includes: [
          'LLM assistants and workflows connected to your data',
          'Document and message extraction and classification',
          'Automations between systems, with logging and retries',
        ],
        fit: 'Processes with a lot of repetitive manual work or information scattered in text.',
        cta: 'Let’s assess a use case',
      },
      {
        id: 'architecture',
        title: 'Architecture and integrations',
        summary:
          'Software architecture: the structure that lets you grow without rewriting it all.',
        body: 'Software architecture, not building architecture: we design how your systems, data and integrations fit together, document every decision and connect the platforms you already use, with automated deployments and cloud monitoring.',
        includes: [
          'Architecture design and reviews with decision records (ADR)',
          'Payment gateways, third-party APIs and webhooks',
          'Cloud, containers, CI/CD, monitoring and backups',
        ],
        fit: 'IT leaders planning a new system or untangling an existing one.',
        cta: 'Let’s review your architecture',
      },
      {
        id: 'saas',
        title: 'SaaS products and platforms',
        summary: 'From an internal tool to a platform sold by subscription.',
        body: 'Multi-tenant platforms with plans, subscriptions, recurring billing, an admin panel and self-service sign-up. It is what we do with our own products.',
        includes: [
          'Data isolation between companies (multi-tenant)',
          'Plans, subscriptions and recurring billing',
          'Platform admin panel and self-service sign-up',
        ],
        fit: 'Founders and companies turning an idea or an internal tool into a product.',
        cta: 'Let’s talk about your platform',
      },
    ],
  },
  process: {
    eyebrow: 'How we work',
    title: 'A clear structure, from the first conversation to production',
    lead: 'Five phases with concrete deliverables. You see real progress in each one.',
    deliverablesLabel: 'Deliverables',
    phases: [
      {
        title: 'Discovery',
        text: 'We learn how your business works, which problem is worth solving first and what success looks like.',
        deliverables: ['Problem map and priorities', 'Scope of a first stage'],
      },
      {
        title: 'Architecture',
        text: 'We propose a written design, with its trade-offs, its risks and a plan by stages, before writing code.',
        deliverables: [
          'Architecture diagram',
          'Documented decisions (ADR)',
          'Proposal with cost per stage',
        ],
      },
      {
        title: 'Development',
        text: 'Short cycles with working software you can try early on, not only at the end.',
        deliverables: [
          'Versions you can try',
          'Automated tests on every change',
          'Code and security reviews',
        ],
      },
      {
        title: 'Integration',
        text: 'We connect with your systems and go live with automated deployments, monitoring and backups in place before users arrive.',
        deliverables: [
          'Verified integrations',
          'Repeatable deployment (CI/CD)',
          'Monitoring and backups',
        ],
      },
      {
        title: 'Evolution',
        text: 'Maintenance, improvements and support once the system is in your hands, or a handover to your team with the documentation.',
        deliverables: ['Improvement plan', 'Support and maintenance', 'Documentation and handover'],
      },
    ],
  },
  products: {
    eyebrow: 'Solutions and products',
    title: 'Our own products, up and running',
    lead: 'Besides custom projects, we build and operate our own products with the same practices we offer.',
    marketing: {
      kicker: 'A Ventea product · marketing.ventea.tech',
      name: 'Ventea Marketing',
      summary:
        'AI marketing for businesses and agencies: it plans the month’s content, prepares copy, creatives and videos in your brand’s voice, and publishes only what you approve.',
      features: [
        'Monthly plan and content calendar',
        'AI copy, creatives and narrated videos',
        'Human approval, also in batches',
        'Publishing to Facebook, Instagram, TikTok and LinkedIn',
        'Message funnel from Facebook and Instagram to WhatsApp',
        'Reach and engagement metrics',
      ],
      flowTitle: 'How it works',
      flow: [
        'Teach it your brand',
        'AI plans the month',
        'You review and approve',
        'It publishes and measures',
      ],
      plansTitle: 'Published plans',
      plans: [
        { name: 'Starter', price: 'US$ 29', detail: '1 brand · 60 posts per month' },
        { name: 'Pro', price: 'US$ 79', detail: '3 brands · 250 posts per month' },
        { name: 'Agency', price: 'US$ 199', detail: '10 brands · 1,000 posts per month' },
        { name: 'Enterprise', price: 'Custom', detail: 'Talk to sales' },
      ],
      plansNote:
        'Ventea Marketing monthly prices as published on marketing.ventea.tech, before taxes. 14-day trial, no card required.',
      languageNote: 'The product is in Spanish.',
      cta: 'Visit Ventea Marketing',
      pricingCta: 'See plans and pricing',
      shot: {
        alt: 'Ventea Marketing home page: “All of the month’s marketing, ready for you to approve”, with a panel of posts pending approval.',
        caption: 'Screenshot of marketing.ventea.tech (in Spanish).',
      },
    },
    restaurants: {
      kicker: 'A Ventea product · app.ventea.tech',
      name: 'Ventea for restaurants',
      summary:
        'Our own SaaS platform, built and operated by Ventea: online ordering and an app under each restaurant’s brand, with no commission per order.',
      features: [
        'Online ordering with the restaurant’s own web and app',
        'Real-time kitchen board',
        'Loyalty points for repeat customers',
        'Subscription plans, no commission per order',
      ],
      facts: [
        { title: 'Architecture', text: 'Multi-tenant SaaS, one subdomain per restaurant' },
        { title: 'Apps', text: 'Web and mobile under each restaurant’s brand' },
        { title: 'Operations', text: 'Containers, scripted deployments and database backups' },
      ],
      languageNote:
        'The product site and the kitchen board are in Spanish; the customer app in the screenshot is in English.',
      cta: 'Visit Ventea for restaurants',
      kitchen: {
        alt: 'Ventea kitchen board with orders in the New, In the kitchen and Ready columns, each with its items, notes and total.',
        caption:
          'Kitchen board: orders move from “New” to “In the kitchen” and “Ready” (sample orders).',
      },
      menu: {
        alt: 'Menu in a restaurant’s app: categories, a discounted combo and products with photo and price.',
        caption: 'Menu in the app, under the restaurant’s brand.',
      },
    },
  },
  projects: {
    eyebrow: 'Projects',
    title: 'Projects',
    lead: 'Cases published with each client’s permission.',
  },
  about: {
    eyebrow: 'About',
    title: 'Engineering with business judgment',
    paragraphs: [
      'Ventea is a digital engineering company: we design, build and connect software for companies. We start with the architecture —how systems, data and integrations fit together— so that what we build can grow.',
      'We document the code, the infrastructure and the architecture decisions so your team can understand and operate them. You talk directly to the people who design and write the software.',
    ],
    principlesTitle: 'How it shows in the work',
    principles: [
      {
        title: 'Business-driven engineering',
        text: 'Every technical decision is explained by what it solves for your operation.',
      },
      {
        title: 'Architectures built to grow',
        text: 'Modular systems that take more users, data and features without a rewrite.',
      },
      {
        title: 'Tailored solutions',
        text: 'We build around your processes instead of bending them to a tool.',
      },
      {
        title: 'Intuitive experiences',
        text: 'Clear, accessible interfaces for the people who use them every day.',
      },
      {
        title: 'Technology integration',
        text: 'We connect what you already have so data stops being copied by hand.',
      },
      {
        title: 'Ongoing support and evolution',
        text: 'We stay with the system after delivery, or hand it over fully documented.',
      },
    ],
    stackTitle: 'Technologies we use',
    stackNote: 'Mature tools with long-term support, easy to maintain.',
  },
  cta: {
    eyebrow: 'Next step',
    title: 'You have an idea. Let’s build what’s next.',
    text: 'Tell us what you need to solve. We reply with questions or a proposal for a first conversation.',
    button: 'Tell us about your project',
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Let’s talk about your project',
    lead: 'A few lines are enough. The form prepares an email to hola@ventea.tech in your own email app; you decide when to send it.',
    directTitle: 'Write to us directly',
    directText: 'If you prefer, write to',
    form: {
      name: 'Name',
      company: 'Company',
      optional: '(optional)',
      email: 'Work email',
      projectType: 'Project type',
      choose: 'Choose one…',
      message: 'What do you need?',
      messageHint: 'The problem you want to solve, the systems involved and any important date.',
      counter: 'Up to {max} characters ({count}/{max}).',
      honeypot: 'Leave this field empty',
      noscript: 'This form needs JavaScript to prepare the email. Write to us directly at',
      submit: 'Prepare email',
      note: 'Opens your email app with the message ready to send to hola@ventea.tech. Nothing is stored on this site.',
      errorsSummary: 'Please check the highlighted fields.',
    },
    projectTypes: {
      software: 'Custom software',
      apps: 'Web or mobile app',
      ai: 'Artificial intelligence and automation',
      architecture: 'Architecture and integrations',
      saas: 'SaaS product or platform',
      other: 'Something else',
    },
    errors: {
      name: 'Please enter your name.',
      email: 'Please enter your email.',
      emailInvalid: 'Please enter a valid email, like name@company.com.',
      projectType: 'Please choose a project type.',
      message: 'Please tell us a bit about your project (at least 10 characters).',
    },
    status: {
      opening: 'Opening your email app…',
      openedTitle: 'We tried to open your email app',
      openedText:
        'If it opened, review the message and press send: nothing has been sent yet. If it did not open, copy the text or write to us directly at hola@ventea.tech.',
      copy: 'Copy the message',
      copied: 'Message copied.',
      copyFailed: 'Could not copy. Select the text below and copy it.',
      writeDirect: 'Write to hola@ventea.tech',
      previewLabel: 'Message text',
    },
    mail: {
      subject: '{type} project — {who}',
      name: 'Name',
      company: 'Company',
      email: 'Email',
      projectType: 'Project type',
      to: 'To',
      subjectLabel: 'Subject',
    },
  },
  footer: {
    tagline: 'Software engineering and digital architecture.',
    navTitle: 'Site',
    servicesTitle: 'Services',
    productsTitle: 'Products',
    contactTitle: 'Contact',
    privacy: 'Privacy policy',
    rights: 'All rights reserved.',
  },
  privacy: {
    eyebrow: 'Legal',
    title: 'Privacy policy',
    lead: 'This policy covers this website, ventea.tech. It is short because the site collects almost nothing.',
    sections: [
      {
        title: 'No cookies, no third-party analytics',
        paragraphs: [
          'This site does not set cookies, does not use third-party analytics or advertising tools and does not load scripts, fonts or images from other domains.',
        ],
      },
      {
        title: 'The contact form',
        paragraphs: [
          'The form does not send anything to our servers. When you submit it, your browser opens your own email app with a pre-filled message to hola@ventea.tech. Nothing is sent until you press send in your email app, and only what you write is shared with us.',
          'If you use the button to copy the message, the text is copied to your device’s clipboard; it does not leave the browser.',
        ],
      },
      {
        title: 'What we do with your email',
        paragraphs: [
          'Your message travels like any other email: it is handled by your email provider and by the provider that hosts our mailbox, hola@ventea.tech. We use the messages you send us only to reply and to discuss your project, and we do not sell them or use them for advertising. You can ask us to delete your messages at any time by writing to hola@ventea.tech.',
        ],
      },
      {
        title: 'Server logs',
        paragraphs: [
          'Like any website, the server that delivers these pages may keep technical access logs (such as IP address, date and requested page) to keep the service secure and working.',
        ],
      },
    ],
    productTitle: 'Ventea for restaurants',
    productText:
      'Our restaurant ordering product has its own terms and privacy policy (in Spanish), published at',
    back: 'Back to the home page',
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'Page not found',
    text: 'The page you are looking for does not exist or has moved.',
    productText: 'If you were looking for Ventea for restaurants, it lives at',
    back: 'Go to the home page',
  },
};
