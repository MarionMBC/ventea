import type { Dict } from './types';

/**
 * Español (Latinoamérica, trato de «usted»). Regla del contenido (TASK-008/009): nada inventado.
 * Sin clientes, testimonios, cifras, certificaciones, equipo ni promesas absolutas. Los datos de
 * Ventea Marketing salen de https://marketing.ventea.tech (brand-research, 2026-10-08).
 */
export const es: Dict = {
  locale: 'es',
  ogLocale: 'es_LA',
  meta: {
    home: {
      title: 'Ventea · Desarrollo de software a medida y arquitectura de software',
      description:
        'Diseñamos, desarrollamos y conectamos software para empresas: software a medida, aplicaciones web y móviles, inteligencia artificial y automatización, arquitectura e integraciones y plataformas SaaS.',
    },
    privacy: {
      title: 'Política de privacidad · Ventea',
      description:
        'Este sitio no usa cookies ni analítica de terceros. El formulario de contacto solo abre su aplicación de correo con un mensaje prellenado.',
    },
    notFound: {
      title: 'Página no encontrada · Ventea',
      description:
        'La página que busca no existe. Vuelva a Ventea: ingeniería de software y arquitectura digital.',
    },
    ogImageAlt: 'Ventea · Software & Architecture: ingeniería de software y arquitectura digital.',
    serviceName: 'Ventea — desarrollo de software y arquitectura de software',
  },
  anchors: {
    services: 'servicios',
    solutions: 'soluciones',
    process: 'proceso',
    about: 'nosotros',
    projects: 'proyectos',
    contact: 'contacto',
  },
  a11y: {
    skip: 'Saltar al contenido',
    mainNav: 'Principal',
    footerNav: 'Pie de página',
    home: 'Ventea, inicio',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
    newTab: '(se abre en otra pestaña)',
  },
  nav: {
    services: 'Servicios',
    solutions: 'Soluciones',
    process: 'Proceso',
    about: 'Nosotros',
    projects: 'Proyectos',
    contact: 'Contacto',
    cta: 'Solicitar propuesta',
  },
  lang: {
    otherShort: 'EN',
    otherLabel: 'English version',
  },
  hero: {
    eyebrow: 'Ingeniería de software y arquitectura digital',
    title: 'Construimos el software que impulsa lo que viene.',
    lead: 'Diseñamos, desarrollamos y conectamos soluciones digitales para transformar la manera en que operan las empresas.',
    primary: 'Hablemos de su proyecto',
    secondary: 'Explorar soluciones',
    tagline: 'Engineered for what’s next',
    artLabel:
      'Diagrama de una arquitectura modular: canales web, móvil y socios conectados a un núcleo de API, con IA, datos, pagos y eventos.',
    modules: {
      web: 'web',
      mobile: 'móvil',
      partners: 'socios',
      core: 'api · auth · dominio',
      ai: 'ia',
      data: 'datos',
      payments: 'pagos',
      events: 'eventos',
    },
  },
  intro: {
    eyebrow: 'Enfoque',
    title: 'La tecnología debe resolver problemas, no crearlos.',
    paragraphs: [
      'Cada empresa llega con algo concreto: procesos que dependen de hojas de cálculo, sistemas que no se hablan entre sí, una idea de producto que necesita salir bien desde el principio.',
      'Ventea convierte esos desafíos en software que se puede operar y hacer crecer. Primero entendemos el negocio, después diseñamos la arquitectura y recién entonces construimos.',
    ],
    points: [
      {
        title: 'Entender',
        text: 'Qué problema conviene resolver primero y cómo se medirá el resultado.',
      },
      {
        title: 'Diseñar',
        text: 'Una arquitectura por escrito, con sus ventajas y sus riesgos, antes del código.',
      },
      {
        title: 'Construir',
        text: 'Software funcionando desde temprano, con pruebas y despliegues automatizados.',
      },
    ],
    diagramLabel: 'Ilustración: piezas sueltas que se ordenan en un sistema.',
  },
  services: {
    eyebrow: 'Servicios',
    title: 'Lo que diseñamos y construimos',
    lead: 'Desde una integración puntual hasta una plataforma completa. Cada servicio se puede contratar por separado.',
    includesLabel: 'Incluye',
    fitLabel: 'Ideal para',
    items: [
      {
        id: 'software',
        title: 'Software a medida',
        summary: 'Sistemas construidos alrededor de cómo opera su empresa, no al revés.',
        body: 'Sistemas internos, portales y back office que reemplazan hojas de cálculo y procesos manuales, con contratos de API documentados y pruebas automatizadas en cada cambio.',
        includes: [
          'Sistemas internos: inventario, operaciones y reportes',
          'Portales para clientes y proveedores',
          'APIs con contratos documentados',
        ],
        fit: 'Equipos que superaron sus hojas de cálculo o una herramienta genérica que ya no se ajusta.',
        cta: 'Hablemos de su sistema',
      },
      {
        id: 'apps',
        title: 'Aplicaciones web y móviles',
        summary: 'Productos digitales que sus clientes y su equipo usan todos los días.',
        body: 'Aplicaciones web, paneles y apps Android e iOS desde una sola base de código multiplataforma, publicadas con su marca.',
        includes: [
          'Aplicaciones web y paneles de gestión',
          'Apps Android e iOS multiplataforma (Flutter o Capacitor)',
          'Publicación en tiendas y gestión de versiones',
        ],
        fit: 'Negocios que quieren su propia app en lugar de depender de la de otros.',
        cta: 'Hablemos de su aplicación',
      },
      {
        id: 'ai',
        title: 'Inteligencia artificial y automatización',
        summary:
          'Modelos de lenguaje y automatizaciones dentro de sus procesos, con supervisión humana.',
        body: 'Integramos modelos de lenguaje (LLM) donde aportan: clasificar, resumir, redactar borradores o extraer datos de documentos, siempre con la revisión de una persona. Y automatizamos el trabajo repetitivo entre sus herramientas. Lo aplicamos en nuestro propio producto, Ventea Marketing.',
        includes: [
          'Asistentes y flujos con LLM conectados a sus datos',
          'Extracción y clasificación de documentos y mensajes',
          'Automatizaciones entre sistemas, con registro y reintentos',
        ],
        fit: 'Procesos con mucho trabajo manual repetitivo o información dispersa en textos.',
        cta: 'Evaluemos un caso de uso',
      },
      {
        id: 'architecture',
        title: 'Arquitectura e integraciones',
        summary:
          'Arquitectura de software: la estructura que permite crecer sin reescribirlo todo.',
        body: 'Arquitectura de software, no de construcción: diseñamos cómo se organizan sus sistemas, sus datos y sus integraciones, documentamos cada decisión y conectamos las plataformas que ya usa, con despliegues automatizados y monitoreo en la nube.',
        includes: [
          'Diseño y revisión de arquitectura con registros de decisiones (ADR)',
          'Integración de pagos, APIs de terceros y webhooks',
          'Nube, contenedores, CI/CD, monitoreo y respaldos',
        ],
        fit: 'Gerencias de TI que planifican un sistema nuevo o necesitan ordenar uno existente.',
        cta: 'Revisemos su arquitectura',
      },
      {
        id: 'saas',
        title: 'Productos y plataformas SaaS',
        summary: 'De la herramienta interna a la plataforma que se vende por suscripción.',
        body: 'Plataformas multiempresa con planes, suscripciones, cobro recurrente, panel de administración y registro autoservicio. Es lo que hacemos con nuestros propios productos.',
        includes: [
          'Aislamiento de datos entre empresas (multi-tenant)',
          'Planes, suscripciones y cobro recurrente',
          'Panel de plataforma y registro autoservicio',
        ],
        fit: 'Fundadores y empresas que convierten una idea o una herramienta interna en producto.',
        cta: 'Hablemos de su plataforma',
      },
    ],
  },
  process: {
    eyebrow: 'Cómo trabajamos',
    title: 'Una estructura clara, de la primera conversación a producción',
    lead: 'Cinco fases con entregables concretos. Usted ve avances reales en cada una.',
    deliverablesLabel: 'Entregables',
    phases: [
      {
        title: 'Descubrimiento',
        text: 'Entendemos cómo funciona su negocio, qué problema conviene resolver primero y cómo se medirá el éxito.',
        deliverables: ['Mapa del problema y prioridades', 'Alcance de una primera etapa'],
      },
      {
        title: 'Arquitectura',
        text: 'Proponemos un diseño por escrito, con sus ventajas, sus riesgos y un plan por etapas, antes de escribir código.',
        deliverables: [
          'Diagrama de arquitectura',
          'Decisiones documentadas (ADR)',
          'Propuesta con costo por etapa',
        ],
      },
      {
        title: 'Desarrollo',
        text: 'Ciclos cortos con software funcionando que usted puede probar desde temprano, no solo al final.',
        deliverables: [
          'Versiones que se pueden probar',
          'Pruebas automatizadas en cada cambio',
          'Revisión de código y de seguridad',
        ],
      },
      {
        title: 'Integración',
        text: 'Conectamos con sus sistemas y llegamos a producción con despliegues automatizados, monitoreo y respaldos listos antes que los usuarios.',
        deliverables: [
          'Integraciones verificadas',
          'Despliegue repetible (CI/CD)',
          'Monitoreo y respaldos',
        ],
      },
      {
        title: 'Evolución',
        text: 'Mantenimiento, mejoras y acompañamiento con el sistema en sus manos, o traspaso a su equipo con la documentación.',
        deliverables: ['Plan de mejoras', 'Soporte y mantenimiento', 'Documentación y traspaso'],
      },
    ],
  },
  products: {
    eyebrow: 'Soluciones y productos',
    title: 'Productos propios, en funcionamiento',
    lead: 'Además de proyectos a medida, construimos y operamos nuestros propios productos con las mismas prácticas que ofrecemos.',
    marketing: {
      kicker: 'Producto de Ventea · marketing.ventea.tech',
      name: 'Ventea Marketing',
      summary:
        'Marketing con IA para negocios y agencias: planifica el contenido del mes, prepara textos, creativos y videos con la voz de su marca, y publica solo lo que usted aprueba.',
      features: [
        'Plan mensual y calendario de contenido',
        'Textos, creativos y videos con IA y narración',
        'Aprobación humana, también por lotes',
        'Publicación en Facebook, Instagram, TikTok y LinkedIn',
        'Embudo de mensajes de Facebook e Instagram a WhatsApp',
        'Métricas de alcance e interacción',
      ],
      flowTitle: 'Cómo funciona',
      flow: [
        'Enséñele su marca',
        'La IA planifica el mes',
        'Usted revisa y aprueba',
        'Se publica y se mide',
      ],
      plansTitle: 'Planes publicados',
      plans: [
        { name: 'Starter', price: 'US$ 29', detail: '1 marca · 60 publicaciones al mes' },
        { name: 'Pro', price: 'US$ 79', detail: '3 marcas · 250 publicaciones al mes' },
        { name: 'Agency', price: 'US$ 199', detail: '10 marcas · 1 000 publicaciones al mes' },
        { name: 'Enterprise', price: 'A medida', detail: 'Hablar con ventas' },
      ],
      plansNote:
        'Precios mensuales de Ventea Marketing publicados en marketing.ventea.tech, sin impuestos. Prueba de 14 días sin tarjeta.',
      languageNote: '',
      cta: 'Visitar Ventea Marketing',
      pricingCta: 'Ver planes y precios',
      shot: {
        alt: 'Portada de Ventea Marketing: «Todo el marketing del mes, listo para que usted lo apruebe», con un panel de publicaciones pendientes de aprobación.',
        caption: 'Captura de marketing.ventea.tech.',
      },
    },
    restaurants: {
      kicker: 'Producto de Ventea · app.ventea.tech',
      name: 'Ventea para restaurantes',
      summary:
        'Plataforma SaaS propia, construida y operada por Ventea: pedidos en línea y una app con la marca de cada restaurante, sin comisión por pedido.',
      features: [
        'Pedidos en línea con la web y la app del propio restaurante',
        'Panel de cocina en tiempo real',
        'Puntos de lealtad para clientes frecuentes',
        'Planes por suscripción, sin comisión por pedido',
      ],
      facts: [
        { title: 'Arquitectura', text: 'SaaS multiempresa, un subdominio por restaurante' },
        { title: 'Aplicaciones', text: 'Web y móvil con la marca de cada restaurante' },
        { title: 'Operación', text: 'Contenedores, despliegues automatizados y respaldos' },
      ],
      languageNote: '',
      cta: 'Visitar Ventea para restaurantes',
      kitchen: {
        alt: 'Panel de cocina de Ventea con pedidos en las columnas Nuevos, En cocina y Listos, cada uno con sus productos, notas y total.',
        caption:
          'Panel de cocina: los pedidos pasan de «Nuevos» a «En cocina» y «Listos» (pedidos de ejemplo).',
      },
      menu: {
        alt: 'Menú en la app de un restaurante: categorías, un combo con descuento y productos con foto y precio.',
        caption: 'Menú en la app, con la marca del restaurante.',
      },
    },
  },
  projects: {
    eyebrow: 'Proyectos',
    title: 'Proyectos',
    lead: 'Casos publicados con autorización de cada cliente.',
  },
  about: {
    eyebrow: 'Nosotros',
    title: 'Ingeniería con criterio de negocio',
    paragraphs: [
      'Ventea es una empresa de ingeniería digital: diseñamos, desarrollamos y conectamos software para empresas. Empezamos por la arquitectura —cómo se organizan los sistemas, los datos y las integraciones— para que lo que construimos pueda crecer.',
      'El código, la infraestructura y la documentación son suyos desde el primer día. Usted habla directamente con las personas que diseñan y escriben el software.',
    ],
    principlesTitle: 'Cómo se nota en el trabajo',
    principles: [
      {
        title: 'Ingeniería orientada al negocio',
        text: 'Cada decisión técnica se explica por lo que resuelve para su operación.',
      },
      {
        title: 'Arquitecturas pensadas para crecer',
        text: 'Sistemas modulares que admiten más usuarios, datos y funciones sin reescribirse.',
      },
      {
        title: 'Soluciones adaptadas',
        text: 'Construimos alrededor de sus procesos, no lo obligamos a cambiar por la herramienta.',
      },
      {
        title: 'Experiencias intuitivas',
        text: 'Interfaces claras y accesibles para quienes las usan todos los días.',
      },
      {
        title: 'Integración tecnológica',
        text: 'Conectamos lo que ya tiene para que los datos dejen de copiarse a mano.',
      },
      {
        title: 'Acompañamiento y evolución',
        text: 'Seguimos junto al sistema después de la entrega, o lo traspasamos documentado.',
      },
    ],
    stackTitle: 'Tecnologías que usamos',
    stackNote: 'Herramientas maduras y con soporte a largo plazo, fáciles de mantener.',
  },
  cta: {
    eyebrow: 'Siguiente paso',
    title: 'Tiene una idea. Construyamos lo que sigue.',
    text: 'Cuéntenos qué necesita resolver. Respondemos con preguntas o con una propuesta para una primera conversación.',
    button: 'Cuéntenos su proyecto',
  },
  contact: {
    eyebrow: 'Contacto',
    title: 'Hablemos de su proyecto',
    lead: 'Unas líneas son suficientes. El formulario prepara un correo para hola@ventea.tech en su propia aplicación de correo; usted decide cuándo enviarlo.',
    directTitle: 'Escríbanos directamente',
    directText: 'Si lo prefiere, escriba a',
    form: {
      name: 'Nombre',
      company: 'Empresa',
      optional: '(opcional)',
      email: 'Correo de trabajo',
      projectType: 'Tipo de proyecto',
      choose: 'Elija una opción…',
      message: '¿Qué necesita?',
      messageHint:
        'El problema que quiere resolver, los sistemas involucrados y cualquier fecha importante.',
      counter: 'Hasta {max} caracteres ({count}/{max}).',
      honeypot: 'Deje este campo vacío',
      submit: 'Preparar correo',
      note: 'Abre su aplicación de correo con el mensaje listo para enviar a hola@ventea.tech. Este sitio no guarda nada.',
      errorsSummary: 'Revise los campos marcados.',
    },
    projectTypes: {
      software: 'Software a medida',
      apps: 'Aplicación web o móvil',
      ai: 'Inteligencia artificial y automatización',
      architecture: 'Arquitectura e integraciones',
      saas: 'Producto o plataforma SaaS',
      other: 'Otro',
    },
    errors: {
      name: 'Escriba su nombre.',
      email: 'Escriba su correo.',
      emailInvalid: 'Escriba un correo válido, por ejemplo nombre@empresa.com.',
      projectType: 'Elija un tipo de proyecto.',
      message: 'Cuéntenos un poco de su proyecto (al menos 10 caracteres).',
    },
    status: {
      opening: 'Abrimos su aplicación de correo…',
      openedTitle: 'Su mensaje está listo en su aplicación de correo',
      openedText:
        'El correo todavía no se envió: revíselo y presione enviar en su aplicación. Si no se abrió, copie el texto y escríbanos directamente.',
      copy: 'Copiar el mensaje',
      copied: 'Mensaje copiado.',
      copyFailed: 'No se pudo copiar. Seleccione el texto de abajo y cópielo.',
      writeDirect: 'Escribir a hola@ventea.tech',
      previewLabel: 'Texto del mensaje',
    },
    mail: {
      subject: 'Proyecto de {type} — {who}',
      name: 'Nombre',
      company: 'Empresa',
      email: 'Correo',
      projectType: 'Tipo de proyecto',
      to: 'Para',
      subjectLabel: 'Asunto',
    },
  },
  footer: {
    tagline: 'Ingeniería de software y arquitectura digital.',
    navTitle: 'Sitio',
    servicesTitle: 'Servicios',
    productsTitle: 'Productos',
    contactTitle: 'Contacto',
    privacy: 'Política de privacidad',
    rights: 'Todos los derechos reservados.',
  },
  privacy: {
    eyebrow: 'Legal',
    title: 'Política de privacidad',
    lead: 'Esta política cubre este sitio, ventea.tech. Es breve porque el sitio casi no recopila datos.',
    sections: [
      {
        title: 'Sin cookies ni analítica de terceros',
        paragraphs: [
          'Este sitio no usa cookies, no usa herramientas de analítica ni de publicidad de terceros y no carga scripts, fuentes ni imágenes de otros dominios.',
        ],
      },
      {
        title: 'El formulario de contacto',
        paragraphs: [
          'El formulario no envía nada a nuestros servidores. Al confirmarlo, su navegador abre su propia aplicación de correo con un mensaje prellenado para hola@ventea.tech. Nada se envía hasta que usted presiona enviar en su aplicación, y solo nos llega lo que usted escribe.',
          'Si usa el botón para copiar el mensaje, el texto se copia en el portapapeles de su dispositivo; no sale del navegador.',
        ],
      },
      {
        title: 'Qué hacemos con su correo',
        paragraphs: [
          'Su mensaje viaja como cualquier correo: lo procesan su proveedor de correo y el proveedor que aloja nuestro buzón, hola@ventea.tech. Usamos los mensajes que nos envía solo para responderle y conversar sobre su proyecto; no los vendemos ni los usamos para publicidad. Puede pedirnos que borremos sus mensajes en cualquier momento escribiendo a hola@ventea.tech.',
        ],
      },
      {
        title: 'Registros del servidor',
        paragraphs: [
          'Como cualquier sitio web, el servidor que entrega estas páginas puede guardar registros técnicos de acceso (como la dirección IP, la fecha y la página solicitada) para mantener el servicio seguro y funcionando.',
        ],
      },
    ],
    productTitle: 'Ventea para restaurantes',
    productText:
      'Nuestro producto para restaurantes tiene sus propios términos y su propia política de privacidad, publicados en',
    back: 'Volver al inicio',
  },
  notFound: {
    eyebrow: 'Error 404',
    title: 'Página no encontrada',
    text: 'La página que busca no existe o cambió de lugar.',
    productText: 'Si buscaba Ventea para restaurantes, está en',
    back: 'Ir al inicio',
  },
};
