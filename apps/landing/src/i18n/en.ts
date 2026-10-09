import type { PlanCode } from '@ventea/shared';

/**
 * Textos en inglés, el idioma principal (TASK-012). Su forma define el tipo `Messages`: el
 * español (`es.ts`) tiene que cumplirlo y un test compara las claves.
 *
 * Mismas afirmaciones que la versión en español, sin agregar ninguna: sin delivery, pago al
 * retirar, 0% de comisión por pedido, puntos con la configuración inicial real, el menú lo
 * cargamos con el restaurante, 14 días gratis sin tarjeta y el pago del plan coordinado con el
 * equipo. Los precios del restaurante de ejemplo siguen en lempiras.
 */
export const en = {
  common: {
    skipToContent: 'Skip to content',
    backHome: 'Back to home',
    brandHome: 'Ventea, home',
    retry: 'Retry',
    languageNav: 'Language',
    /** Link al mismo contenido en el otro idioma. */
    switchTo: { short: 'ES', label: 'Español', title: 'Ver esta página en español', lang: 'es' },
    networkError: 'We couldn’t connect to Ventea. Check your connection and try again.',
    /**
     * Detalle de un error de la API. Los mensajes de la API vienen en español: en inglés se
     * muestra uno propio.
     */
    apiDetail: (_message: string, status: number): string =>
      status === 0
        ? 'We couldn’t connect to Ventea. Check your connection and try again.'
        : `The request failed (${status}).`,
  },

  header: {
    sectionsLabel: 'Sections',
    links: {
      product: 'Product',
      points: 'Points',
      how: 'How it works',
      pricing: 'Pricing',
      faq: 'FAQ',
    },
    signIn: 'Sign in',
    signUp: 'Sign up',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },

  hero: {
    eyebrow: 'The digital platform for your restaurant',
    titleLines: ['Your restaurant.', 'Your own app.', 'Your own customers.'] as [
      string,
      string,
      string,
    ],
    lead: 'Take direct orders, reward your customers with points and grow your brand with a digital experience of your own.',
    feeStrong: '0% commission per order.',
    feeRest: 'Pay a flat monthly or annual fee, no matter how much you sell.',
    primaryCta: 'Sign up my restaurant',
    secondaryCta: 'See how it works',
    fine: (days: number) => `${days}-day free trial · No card required · No commitment`,
    ticketNew: 'New order',
    ticketTakeout: 'Takeout',
    ticketFee: 'Ventea commission',
    pointsBadge: (points: number) => `+${points} points`,
    steps: ['Home', 'Dish', 'Order status', 'Points'] as [string, string, string, string],
    stepsLabel: 'Demo steps',
    stepPrefix: (n: number) => `Step ${n}: `,
    play: 'Play',
    pause: 'Pause',
    controlSuffix: ' the demo',
    disclaimer: 'Real screenshots of the Carolina Hot Chicken app. Sample account and order.',
  },

  ownBrand: {
    eyebrow: 'Your own identity',
    title: 'Your brand deserves more than a spot on a third-party app.',
    lead: 'Third-party apps can help new customers discover you. Ventea is the channel for the people who already know you: a menu and an order under your name, your own address on ventea.tech and your own points program.',
    crowdTitle: 'On a third-party app',
    crowdText: 'Your restaurant is one more option in a list, under the app’s brand.',
    ownTitle: 'On your own channel',
    ownText:
      'Your name, your photos and your colors from start to finish. Customers order from you.',
  },

  journey: {
    eyebrow: 'Customer experience',
    title: 'An experience that brings people back.',
    tablistLabel: 'Journey stages',
    stages: {
      explore: {
        tab: 'Browse the menu',
        title: 'A menu with your brand, right on their phone',
        text: 'Your customer opens your restaurant’s app and browses the menu with photos, prices and combos. Your brand is the first thing they see.',
      },
      order: {
        tab: 'Place an order',
        title: 'Takeout or dine in',
        text: 'They pick their dishes, confirm with their account and follow the order status: New, In the kitchen, Ready. They pay at pickup, directly at your restaurant.',
      },
      return: {
        tab: 'Earn rewards',
        title: 'Every order earns points for the next one',
        text: (bonus: number, earned: number) =>
          `With the default settings they earn 1 point per unit of currency spent, plus ${bonus} welcome points when they create their account. The sample order on screen earned them ${earned}.`,
      },
    },
    play: 'Play journey',
    pause: 'Pause journey',
  },

  direct: {
    eyebrow: 'Direct orders',
    title: 'A closer relationship with your customers. Fewer middlemen.',
    lead: 'The order your customer confirms shows up on your kitchen board, with a sound alert if you turn it on. Your team moves it forward with one tap and the customer sees the status on their phone.',
    facts: [
      { strong: 'Takeout or dine in.', text: 'The customer chooses when confirming.' },
      { strong: 'Pay at pickup.', text: 'Straight to your register, no middlemen.' },
      {
        strong: 'Clear statuses.',
        text: 'New, In the kitchen, Ready and Delivered, visible to your team and your customer.',
      },
    ],
  },

  loyalty: {
    eyebrow: 'Points program',
    title: 'Turn a good experience into another visit.',
    lead: 'Your customers earn points with every delivered order and redeem them as a discount on the next one. They see their balance and where every point came from.',
    earnTerm: 'Earn',
    earnDef: '1 point per unit of currency spent (lempira or dollar)',
    welcomeTerm: 'Welcome',
    welcomeDef: (points: number) => `${points} points when they create their account`,
    redeemTerm: 'Redeem',
    redeemDef: (points: number) => `From ${points} points; each point is worth 1 cent`,
    note: 'These are the values every restaurant starts with. If you want different ones, we adjust them with you.',
    example: 'Sample account with the default settings.',
  },

  shots: {
    app: {
      home: 'Home screen of the Carolina Hot Chicken app: pickup at a branch, a weekly promo and the menu categories.',
      menu: 'Menu in the Carolina Hot Chicken app: categories, a discounted combo and dishes with photo and price.',
      product:
        'Dish detail in the Carolina Hot Chicken app: Reaper Tender Sandwich with heat level, extras and an Add button.',
      tracking:
        'Order CHC-1042 in the Carolina Hot Chicken app: a pickup order in the kitchen, with its items and total.',
      profile:
        'Customer profile in the Carolina Hot Chicken app with 74 points: 50 welcome points and 24 from an order.',
    },
    panelAlt:
      'Ventea restaurant panel: orders board with New, In the kitchen and Ready columns, each order with its items, notes and total, next to a sidebar with Orders, History and Billing.',
    historyAlt:
      'Ventea restaurant panel, Today’s history: a summary of delivered and cancelled orders and sales, and the list of closed orders.',
    appCaption: 'Real screenshots of the Carolina Hot Chicken app. Sample account and order.',
  },

  control: {
    eyebrow: 'Control for your restaurant',
    title: 'Run your business from one place.',
    lead: 'A panel your team gets in minutes. It works in the browser on a computer, a tablet or a phone.',
    url: 'your-restaurant.ventea.tech/admin',
    caption: 'Screenshot of the real panel, with sample orders.',
    features: [
      {
        title: 'Order board',
        text: 'New, In the kitchen and Ready, each order with its items, notes and total.',
      },
      {
        title: 'New order alert',
        text: 'Optional sound, the order highlighted and a counter in the browser tab.',
      },
      {
        title: 'Today’s history',
        text: 'The day’s closed orders, at hand to check on any question.',
      },
      {
        title: 'Your plan and billing',
        text: 'The owner sees their plan, when the trial ends and the status of their subscription.',
      },
    ] as { title: string; text: string }[],
  },

  how: {
    eyebrow: 'How it works',
    title: 'Taking your restaurant digital can be simpler.',
    lead: 'Signing up takes a few minutes and no card. We do the rest with you.',
    cta: 'Sign up my restaurant',
    steps: [
      {
        title: 'Choose your plan',
        text: (days: number) =>
          `Start with a ${days}-day free trial, no card required. You can change plans later.`,
      },
      {
        title: 'Register your restaurant',
        text: () => 'Your business name and your own address: your-restaurant.ventea.tech.',
      },
      {
        title: 'Create your account',
        text: () =>
          'Your panel is ready with your main location and your points program. Your address goes live in one or two minutes.',
      },
      {
        title: 'We load your menu with you',
        text: () =>
          'Share your menu (dishes, prices, photos and extras) and we set it up in your account.',
      },
      {
        title: 'Take orders and reward your customers',
        text: () =>
          'Your customers order with their account, orders arrive on your board and every delivered purchase earns them points.',
      },
    ] as { title: string; text: (days: number) => string }[],
  },

  identity: {
    eyebrow: 'What sets you apart',
    title: 'A digital experience that carries your restaurant’s name.',
    pillars: [
      {
        title: 'Identity',
        text: 'Your logo, your colors and your photos. To the customer, the app belongs to your restaurant.',
      },
      {
        title: 'Direct orders',
        text: 'The order goes from your customer to your kitchen, and payment happens at your store.',
      },
      {
        title: 'Loyalty',
        text: 'Your own points, earned and redeemed only at your restaurant.',
      },
    ] as { title: string; text: string }[],
    caption:
      'Carolina Hot Chicken already takes orders with Ventea. Screenshots of its app, with its brand.',
  },

  pricing: {
    eyebrow: 'Plans and pricing',
    title: 'One flat fee. Zero commission per order.',
    lead: (days: number) =>
      `Every plan starts with ${days} days free, no card required. Change plans whenever you need.`,
    loadingLabel: 'Loading prices',
    loadError: 'We couldn’t load the prices.',
    recommended: 'Recommended',
    per: { month: 'month', year: 'year' },
    yearlyNote: (monthly: string, savings: string) =>
      `Works out to ${monthly} a month · save ${savings}`,
    monthlyNote: (yearly: string) => `Or ${yearly} a year, with 2 months free`,
    cta: (plan: string) => `Try ${plan} free`,
    ctaSuffix: (days: number) => ` for ${days} days`,
    fine: 'Prices in US dollars (USD). No setup fee and no commitment. Plan payment is arranged with our team when the trial ends.',
  },

  toggle: {
    legend: 'Billing period',
    monthly: 'Monthly',
    yearly: 'Annual',
    yearlyExtra: '2 months free',
  },

  plans: {
    /** Nombre por código. Vacío = el que manda la API. */
    names: { basic: 'Basic', pro: 'Pro', chain: 'Chain' } as Partial<Record<PlanCode, string>>,
    taglines: {
      basic: 'To start selling direct under your own brand.',
      pro: 'Your own app in the stores and up to 3 locations.',
      chain: 'For chains with several locations.',
    } as Partial<Record<PlanCode, string>>,
    locations: (max: number | null) =>
      max === null ? 'Unlimited locations' : max === 1 ? '1 location' : `Up to ${max} locations`,
    /** Dashboard users (active + pending invitations, TASK-022). */
    staff: (max: number | null) =>
      max === null
        ? 'Unlimited dashboard users'
        : max === 1
          ? '1 dashboard user (you)'
          : `Up to ${max} dashboard users (you included)`,
    features: {
      ownAddress: 'Orders at your own address on ventea.tech',
      board: 'Order panel with sound alert',
      points: 'Loyalty points for your customers',
      brandedApp: 'Branded app for Android and iOS',
      customDomain: 'Your own domain',
      reports: 'Sales reports',
      prioritySupport: 'Priority support',
    },
  },

  faq: {
    eyebrow: 'FAQ',
    title: 'What people usually ask us',
    leadBefore: 'Another question? Email us at ',
    questions: (v: { days: number; bonus: number; minToRedeem: number }) => [
      {
        q: 'How does Ventea work?',
        a: 'You sign up your restaurant, we load your menu with you and your customers order through an experience with your brand. Orders arrive on your kitchen board, your team moves them from “New” to “In the kitchen” and “Ready”, and every delivered order earns the customer points.',
      },
      {
        q: 'What does having your own app mean?',
        a: 'Your customers order in an experience with your restaurant’s name, logo and colors, not in a list next to others. Every plan includes your own address on ventea.tech; on the Pro and Chain plans we also prepare your branded app for Android and iOS.',
      },
      {
        q: 'How do restaurants receive orders?',
        a: 'In the order panel, from the browser on a computer, tablet or phone. Every new order shows up on its own, highlighted and with a sound alert if you turn it on. Today orders are for takeout or dine-in, and the customer pays at pickup; there is no delivery or online payment within Ventea.',
      },
      {
        q: 'How do the points work?',
        a: `With the default settings, your customer earns 1 point per unit of currency of the order (1 point per lempira) when the order is delivered, plus ${v.bonus} welcome points when they create their account. They can redeem them from ${v.minToRedeem} points as a discount on an order; each point is worth 1 cent. If an order is canceled, the redeemed points go back to their balance.`,
      },
      {
        q: 'Are there commissions per order?',
        a: 'No. Ventea charges no commission per order: you only pay your plan’s flat fee, no matter how much you sell. If in the future you take card payments through a payment processor, that processor’s fee is separate and agreed between you and them.',
      },
      {
        q: 'What does the service cost?',
        a: `Your plan’s price, in US dollars (USD), monthly or yearly; the annual payment equals ten months. No setup fee and no commitment. Every plan starts with ${v.days} days free, no card required. Today payment is arranged with our team: in the Billing section of your panel you can see when your trial ends, and to activate your plan you write to us and we arrange the payment with you.`,
      },
      {
        q: 'How does sign-up start?',
        a: 'In three steps: choose your plan, enter your restaurant’s name and your address (your-restaurant.ventea.tech), and create your account. Your panel is ready right away and the address goes live in one or two minutes.',
      },
      {
        q: 'What devices do I need?',
        a: 'For the panel, any computer, tablet or phone with an up-to-date browser and an internet connection. Your customers order from their phone.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes, from the Billing section of your panel. There is no commitment and no penalty. If you cancel, your service keeps working until the end of the period you already paid for.',
      },
    ],
  },

  demo: {
    eyebrow: 'Demo',
    title: 'Would you rather we showed you?',
    lead: 'Tell us about your restaurant and we’ll show you Ventea on a short call, with your questions.',
    name: 'Your name',
    restaurant: 'Restaurant name',
    city: 'City and country (optional)',
    phone: 'Phone or WhatsApp (optional)',
    message: 'Anything you’d like to tell us? (optional)',
    submit: 'Request a demo',
    hint: (email: string) => `Your email app opens with the message ready to send to ${email}.`,
    sentBefore: 'If your email app didn’t open, write to us directly at ',
    nameError: 'Please enter your name.',
    restaurantError: 'Please enter your restaurant’s name.',
    mail: {
      subject: 'I’d like a Ventea demo',
      greeting: 'Hi, I’d like to see a Ventea demo.',
      name: 'Name',
      restaurant: 'Restaurant',
      city: 'City and country',
      phone: 'Phone or WhatsApp',
    },
  },

  final: {
    title: 'Your restaurant has a brand.',
    titleAccent: 'It’s time to take it further.',
    primaryCta: 'Get started with Ventea',
    secondaryCta: 'Request a demo',
    fine: (days: number) => `${days} days free · No card required · 0% commission per order`,
  },

  footer: {
    about:
      'Branded app, direct orders and loyalty points for restaurants. No commission per order.',
    productTitle: 'Product',
    links: {
      experience: 'Customer experience',
      orders: 'Direct orders',
      points: 'Points program',
      pricing: 'Pricing',
      faq: 'FAQ',
      signup: 'Sign up my restaurant',
    },
    contactTitle: 'Contact',
    contactBefore: 'Questions, or want a demo? Email us at ',
    legalTitle: 'Legal',
    /** Las legales solo existen en español (ley de Honduras): la etiqueta lo dice. */
    terms: 'Terms of Service (Spanish)',
    privacy: 'Privacy Policy (Spanish)',
    madeBy: 'A product of',
    corporate: 'Ventea, software and architecture',
  },

  panelAccess: {
    label: 'Go to my panel',
    placeholder: 'your-restaurant',
    go: 'Go',
    error: 'Enter your restaurant’s address, for example: my-restaurant.',
    hint: 'The address you chose when you signed up.',
  },

  whatsapp: {
    message: 'Hi, I’d like to know more about Ventea for my restaurant.',
    label: 'Message us on WhatsApp',
  },

  signup: {
    stepTitles: ['Choose your plan', 'Your restaurant', 'Your account'] as [string, string, string],
    kicker: (days: number) => `${days}-day free trial · no card required`,
    stepperLabel: 'Sign-up steps',
    stepOf: (step: number) => `Step ${step} of 3: `,
    closedStrong: 'Sign-up is temporarily closed, please write to us.',
    closedBefore: ' We received a lot of sign-ups today. Write to us at ',
    closedAfter: ' and we’ll open your account.',
    maybeCreatedStrong: 'Your restaurant may already have been created.',
    maybeCreatedBefore:
      ' The previous attempt was cut off before we got a response. Try signing in at ',
    maybeCreatedMiddle:
      ' with your email and the password you chose. If that doesn’t work, write to us at ',
    restaurantName: 'Restaurant name',
    slugLabel: 'Web address',
    slugPreviewBefore: 'Your customers will order at ',
    slugPlaceholder: 'your-restaurant',
    slugChecking: 'One second: we’re checking the address.',
    ownerName: 'Your name',
    email: 'Email',
    emailHint: 'You’ll sign in to your restaurant’s panel with this email.',
    acceptTerms: 'I accept the Terms of Service and the Privacy Policy (in Spanish)',
    readFirst: 'Read them first: ',
    termsLink: 'Terms of Service (Spanish)',
    privacyLink: 'Privacy Policy (Spanish)',
    newTab: ' (opens in a new tab)',
    honeypot: 'Do not fill in',
    summaryBefore: '',
    summaryAfter: (interval: 'month' | 'year', price: string) =>
      ` plan, ${interval === 'year' ? 'annual' : 'monthly'}: ${price} USD when the trial ends. You pay nothing today.`,
    back: 'Back',
    continue: 'Continue',
    creating: 'Creating your restaurant…',
    create: 'Create my restaurant',
    loadingPlans: 'Loading plans…',
    plansError: 'We couldn’t load the plans.',
    planLegend: 'Plan',
    brandedApp: ' · branded app',
    per: { month: 'month', year: 'year' },
    ready: {
      checking: 'Getting your secure address ready… (this can take up to 2 minutes)',
      ready: 'Your address is ready! You can now go to your panel.',
      slow: 'This is taking longer than usual. Try again in a few minutes with the button below.',
    },
    slowBefore: ' If it still won’t open, write to us at ',
    doneTitle: (restaurant: string) => `All set! ${restaurant} is now on Ventea`,
    enterPanel: 'Go to my panel',
    pageLabel: 'Your ordering page',
    userLabel: 'Panel user',
    trialEnds: 'Your free trial ends',
    errors: {
      name: 'Enter your restaurant’s name.',
      owner: 'Enter your name.',
      email: 'Enter a valid email, for example name@email.com.',
      password: (min: number) => `Your password needs at least ${min} characters.`,
      terms: 'To create your restaurant you need to accept the terms and the privacy policy.',
      taken:
        'That address was already taken by another restaurant. Choose another one to continue.',
      slugInvalid: 'Check the name and the address: one of them doesn’t have the right format.',
      slugApi: (_message: string) => 'That address isn’t available. Choose another address.',
      dataInvalid: 'Check your details: a field doesn’t have the right format.',
      dataApi: (_message: string) => 'Check your details: a field isn’t valid.',
      server: 'Something went wrong on our side. Try again in a few minutes.',
      other: (_message: string, status: number) =>
        `Something went wrong (${status}). Please try again.`,
    },
    slug: {
      empty: 'Choose your restaurant’s address.',
      checking: 'Checking if it’s available…',
      available: 'It’s available!',
      taken: 'That address is already used by another restaurant. Try another one.',
      reserved: 'That address is reserved. Try another one.',
      invalid: 'Use 3 to 63 lowercase letters, numbers or hyphens (no spaces or accents).',
      unknown: 'We couldn’t check it right now; we’ll confirm it when you create your account.',
    },
  },

  password: {
    label: 'Password',
    show: 'Show',
    hide: 'Hide',
    hintEmpty: (min: number) => `At least ${min} characters. Mix uppercase, numbers and symbols.`,
    missing: (n: number) => `${n} more ${n === 1 ? 'character' : 'characters'} to go.`,
    strength: (label: string) => `Strength: ${label}.`,
    strengthLabels: ['Too short', 'Fair', 'Good', 'Strong', 'Very strong'] as [
      string,
      string,
      string,
      string,
      string,
    ],
  },
};

export type Messages = typeof en;
