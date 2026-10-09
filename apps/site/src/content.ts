/**
 * Copy of the corporate site (English). Kept as data so tests can check it and components stay
 * small. Rule (TASK-008): no invented clients, logos, testimonials, figures, certifications,
 * awards or team members. The only case shown is our own product, Ventea for restaurants.
 */

export type IconName = 'code' | 'mobile' | 'architecture' | 'saas' | 'plug' | 'ops';

export interface Service {
  id: string;
  icon: IconName;
  title: string;
  summary: string;
  includes: readonly string[];
  goodFit: string;
}

export const SERVICES: readonly Service[] = [
  {
    id: 'custom-software',
    icon: 'code',
    title: 'Custom software development',
    summary:
      'Web applications, APIs and internal systems built around the way your business works.',
    includes: [
      'Web apps and customer portals',
      'REST APIs with documented contracts',
      'Internal tools: back office, inventory, reporting',
    ],
    goodFit: 'Teams that outgrew spreadsheets or an off-the-shelf tool that no longer fits.',
  },
  {
    id: 'mobile-apps',
    icon: 'mobile',
    title: 'Mobile apps',
    summary:
      'Android and iOS apps from a single cross-platform codebase, published under your brand.',
    includes: [
      'Cross-platform apps (Flutter or Capacitor)',
      'Store publishing and release management',
      'Push notifications, offline-friendly flows',
    ],
    goodFit: 'Businesses that want their own app instead of renting space on someone else’s.',
  },
  {
    id: 'architecture',
    icon: 'architecture',
    title: 'Software & cloud architecture',
    summary: 'Design and review of systems that need to grow without being rewritten every year.',
    includes: [
      'Architecture design and written decision records',
      'Architecture and code reviews of existing systems',
      'Scalability, multi-tenancy and migration plans',
    ],
    goodFit: 'CTOs and IT managers planning a new system or untangling an existing one.',
  },
  {
    id: 'saas',
    icon: 'saas',
    title: 'SaaS platforms',
    summary: 'Products you sell by subscription, with the plumbing that a real SaaS needs.',
    includes: [
      'Plans, subscriptions and recurring billing',
      'Multi-tenant data isolation',
      'Platform admin panel and self-service sign-up',
    ],
    goodFit: 'Founders and companies turning an internal tool or an idea into a product.',
  },
  {
    id: 'integrations',
    icon: 'plug',
    title: 'Integrations & payments',
    summary: 'Connect the systems you already use so data stops being copied by hand.',
    includes: [
      'Payment gateways and card tokenization',
      'Third-party APIs, webhooks and data sync',
      'Automations between your tools',
    ],
    goodFit: 'Operations that depend on several systems that do not talk to each other.',
  },
  {
    id: 'devops',
    icon: 'ops',
    title: 'DevOps & operations',
    summary: 'Reliable deployments and a production environment you can understand.',
    includes: [
      'Containers, CI/CD pipelines and repeatable deploys',
      'Monitoring, logs and alerts',
      'Backups with tested restores, security hardening',
    ],
    goodFit: 'Teams whose deploys are manual, risky or depend on one person.',
  },
];

export interface Step {
  title: string;
  text: string;
}

export const PROCESS: readonly Step[] = [
  {
    title: 'Discovery',
    text: 'We learn how your business works, what problem is worth solving first and what success looks like.',
  },
  {
    title: 'Architecture',
    text: 'We propose a design, its trade-offs and a plan by stages, in writing, before building anything.',
  },
  {
    title: 'Iterative build',
    text: 'Short cycles with working software you can try. You see progress every week, not at the end.',
  },
  {
    title: 'Go-live',
    text: 'Automated deploys, monitoring and backups in place before real users arrive.',
  },
  {
    title: 'Ongoing support',
    text: 'Maintenance, improvements and help operating the system once it is in your hands.',
  },
];

export const QUALITY: readonly string[] = [
  'Automated tests on every change',
  'Code and security reviews before merging',
  'Architecture Decision Records (ADR) for every important choice',
];

export const STACK: readonly { area: string; items: readonly string[] }[] = [
  { area: 'Languages', items: ['TypeScript'] },
  { area: 'Backend', items: ['Node.js', 'NestJS'] },
  { area: 'Web', items: ['React'] },
  { area: 'Mobile', items: ['Flutter', 'Capacitor'] },
  { area: 'Data', items: ['PostgreSQL'] },
  { area: 'Infrastructure', items: ['Docker', 'Linux / VPS', 'CI/CD'] },
];

export const REASONS: readonly Step[] = [
  {
    title: 'Your code, your documentation',
    text: 'The source code, the infrastructure setup and the decision records belong to you from day one.',
  },
  {
    title: 'Frequent deliveries',
    text: 'You get working software in short cycles, so priorities can change before money is spent.',
  },
  {
    title: 'Security by design',
    text: 'Access control, data isolation, security headers and reviews are part of the work, not an add-on.',
  },
  {
    title: 'Direct contact with the builders',
    text: 'You talk to the people who design and write the software, without layers in between.',
  },
];

export const PRODUCT = {
  name: 'Ventea for restaurants',
  summary:
    'Our own SaaS platform, built and operated by us: online ordering and an app under each restaurant’s brand, with no commission per order.',
  features: [
    'Online ordering with the restaurant’s own web and app',
    'Real-time kitchen board',
    'Loyalty points for repeat customers',
    'Subscription plans, no commission per order',
  ],
  note: 'The product site is in Spanish.',
} as const;

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ: readonly FaqItem[] = [
  {
    q: 'How do you price a project?',
    a: 'After a short discovery call we send a written proposal with scope, stages and cost per stage. Larger projects are priced stage by stage, so you only commit to what is defined.',
  },
  {
    q: 'How long does a project take?',
    a: 'It depends on the size. An integration or a focused first version usually takes weeks; a full platform is planned in stages of a few months, each one delivering usable software. You get a dated plan before we start.',
  },
  {
    q: 'What happens after delivery?',
    a: 'We can keep maintaining and improving the system under a monthly agreement, or hand it over to your team with the documentation and a walkthrough.',
  },
  {
    q: 'Who owns the code?',
    a: 'You do. The source code, the repositories and the documentation are yours, and you can take them to another team at any time.',
  },
];

export const PROJECT_TYPES: readonly string[] = [
  'Custom software',
  'Mobile app',
  'Architecture review',
  'SaaS platform',
  'Integrations & payments',
  'DevOps & operations',
  'Something else',
];
