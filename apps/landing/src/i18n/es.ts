import type { Messages } from './en';

/**
 * Textos en español (TASK-012): los de la landing rediseñada en TASK-010, sin cambios. La landing
 * trata de «usted»; el registro, de «tú» (así estaba).
 */
export const es: Messages = {
  common: {
    skipToContent: 'Saltar al contenido',
    backHome: 'Volver al inicio',
    brandHome: 'Ventea, inicio',
    retry: 'Reintentar',
    languageNav: 'Idioma',
    switchTo: { short: 'EN', label: 'English', title: 'View this page in English', lang: 'en' },
    networkError: 'No pudimos conectar con Ventea. Revisa tu conexión e intenta de nuevo.',
    apiDetail: (message: string) => message,
  },

  header: {
    sectionsLabel: 'Secciones',
    links: {
      product: 'Producto',
      points: 'Puntos',
      how: 'Cómo funciona',
      pricing: 'Precios',
      faq: 'Preguntas',
    },
    signIn: 'Iniciar sesión',
    signUp: 'Registrarme',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
  },

  hero: {
    eyebrow: 'La plataforma digital para su restaurante',
    titleLines: ['Su restaurante.', 'Su propia app.', 'Sus propios clientes.'],
    lead: 'Reciba pedidos directos, recompense a sus clientes con puntos y fortalezca su marca desde una experiencia digital propia.',
    feeStrong: '0% de comisión por pedido.',
    feeRest: 'Paga una tarifa fija mensual o anual, venda lo que venda.',
    primaryCta: 'Registrar mi restaurante',
    secondaryCta: 'Ver cómo funciona',
    fine: (days) => `${days} días de prueba gratis · Sin tarjeta · Sin permanencia`,
    ticketNew: 'Pedido nuevo',
    ticketTakeout: 'Para llevar',
    ticketFee: 'Comisión Ventea',
    pointsBadge: (points) => `+${points} puntos`,
    steps: ['Inicio', 'Platillo', 'Estado del pedido', 'Puntos'],
    stepsLabel: 'Pasos de la demostración',
    stepPrefix: (n) => `Paso ${n}: `,
    play: 'Reproducir',
    pause: 'Pausar',
    controlSuffix: ' la demostración',
    disclaimer: 'Capturas reales de la app de Carolina Hot Chicken. Cuenta y pedido de ejemplo.',
  },

  ownBrand: {
    eyebrow: 'Identidad propia',
    title: 'Su marca merece algo más que aparecer en una app de terceros.',
    lead: 'Las apps de terceros pueden ayudarle a que clientes nuevos lo descubran. Ventea es el canal para quienes ya lo conocen: un menú y un pedido con su nombre, su propia dirección en ventea.tech y su propio programa de puntos.',
    crowdTitle: 'En una app de terceros',
    crowdText: 'Su restaurante es una opción más en una lista, con la marca de la app.',
    ownTitle: 'En su canal propio',
    ownText: 'Su nombre, sus fotos y sus colores de principio a fin. El cliente le pide a usted.',
  },

  journey: {
    eyebrow: 'Experiencia del cliente',
    title: 'Una experiencia que invita a volver.',
    tablistLabel: 'Etapas del recorrido',
    stages: {
      explore: {
        tab: 'Explorar el menú',
        title: 'Un menú con su marca, desde el teléfono',
        text: 'Su cliente abre la app de su restaurante y recorre el menú con fotos, precios y combos. Su marca es lo primero que ve.',
      },
      order: {
        tab: 'Realizar un pedido',
        title: 'Pide para llevar o para comer en el local',
        text: 'Elige sus platos, confirma con su cuenta y sigue el estado del pedido: Nuevo, En cocina, Listo. Paga al retirar, directo en su restaurante.',
      },
      return: {
        tab: 'Acumular recompensas',
        title: 'Cada pedido suma puntos para el siguiente',
        text: (bonus, earned) =>
          `Con la configuración inicial gana 1 punto por unidad de moneda gastada, más ${bonus} de bienvenida al crear su cuenta. El pedido de ejemplo en pantalla le dio ${earned}.`,
      },
    },
    play: 'Reproducir recorrido',
    pause: 'Pausar recorrido',
  },

  direct: {
    eyebrow: 'Pedidos directos',
    title: 'Más relación con sus clientes. Menos intermediarios.',
    lead: 'El pedido que confirma su cliente aparece en el tablero de su cocina, con aviso sonoro si lo activa. Su equipo lo avanza con un toque y el cliente ve el estado en su teléfono.',
    facts: [
      { strong: 'Para llevar o comer en el local.', text: 'El cliente elige al confirmar.' },
      { strong: 'Pago al retirar.', text: 'Directo en su caja, sin intermediarios.' },
      {
        strong: 'Estados claros.',
        text: 'Nuevo, En cocina, Listo y Entregado, a la vista de su equipo y de su cliente.',
      },
    ],
  },

  loyalty: {
    eyebrow: 'Programa de puntos',
    title: 'Convierta una buena experiencia en otra visita.',
    lead: 'Sus clientes suman puntos con cada pedido entregado y los canjean como descuento en el siguiente. Ven su saldo y de dónde salió cada punto.',
    earnTerm: 'Gana',
    earnDef: '1 punto por unidad de moneda gastada (lempira o dólar)',
    welcomeTerm: 'Bienvenida',
    welcomeDef: (points) => `${points} puntos al crear su cuenta`,
    redeemTerm: 'Canjea',
    redeemDef: (points) => `Desde ${points} puntos; cada punto vale 1 centavo`,
    note: 'Son los valores con los que arranca cada restaurante. Si quiere otros, los ajustamos con usted.',
    example: 'Ejemplo con la configuración inicial.',
  },

  shots: {
    app: {
      home: 'Inicio de la app de Carolina Hot Chicken: retiro en sucursal, una promoción de la semana y las categorías del menú.',
      menu: 'Menú en la app de Carolina Hot Chicken: categorías, un combo con descuento y platillos con foto y precio.',
      product:
        'Detalle de un platillo en la app de Carolina Hot Chicken: Reaper Tender Sandwich con nivel de picante, extras y botón para agregar.',
      tracking:
        'Pedido CHC-1042 en la app de Carolina Hot Chicken: pedido para llevar en cocina, con sus productos y total.',
      profile:
        'Perfil de un cliente en la app de Carolina Hot Chicken con 74 puntos: 50 de bienvenida y 24 de un pedido.',
    },
    panelAlt:
      'Panel del restaurante de Ventea: tablero de pedidos con las columnas Nuevos, En cocina y Listos, cada pedido con sus productos, notas y total, junto a la barra lateral con Pedidos, Historial y Facturación.',
    historyAlt:
      'Panel del restaurante de Ventea, Historial de hoy: resumen de pedidos entregados, cancelados y ventas, y la lista de pedidos cerrados.',
    appCaption: 'Capturas reales de la app de Carolina Hot Chicken. Cuenta y pedido de ejemplo.',
  },

  control: {
    eyebrow: 'Control para el restaurante',
    title: 'El control de su negocio, desde un solo lugar.',
    lead: 'Un panel que su equipo entiende en minutos. Funciona en el navegador de una computadora, una tableta o un teléfono.',
    url: 'su-restaurante.ventea.tech/admin',
    caption: 'Captura del panel real, con pedidos de ejemplo.',
    features: [
      {
        title: 'Tablero de pedidos',
        text: 'Nuevos, En cocina y Listos, cada pedido con sus productos, notas y total.',
      },
      {
        title: 'Aviso de pedido nuevo',
        text: 'Sonido opcional, el pedido resaltado y el contador en la pestaña del navegador.',
      },
      {
        title: 'Historial de hoy',
        text: 'Los pedidos del día ya cerrados, a mano para revisar cualquier duda.',
      },
      {
        title: 'Su plan y su facturación',
        text: 'El dueño ve su plan, hasta cuándo dura la prueba y el estado de su suscripción.',
      },
    ],
  },

  how: {
    eyebrow: 'Cómo funciona',
    title: 'Digitalizar su restaurante puede ser más sencillo.',
    lead: 'El registro toma unos minutos y no pide tarjeta. Lo demás lo hacemos con usted.',
    cta: 'Registrar mi restaurante',
    steps: [
      {
        title: 'Elija su plan',
        text: (days) =>
          `Empiece con ${days} días de prueba gratis, sin tarjeta. Puede cambiar de plan después.`,
      },
      {
        title: 'Registre su restaurante',
        text: () => 'El nombre de su negocio y su dirección propia: su-restaurante.ventea.tech.',
      },
      {
        title: 'Cree su cuenta',
        text: () =>
          'Su panel queda listo con su sucursal principal y su programa de puntos. La dirección se activa en uno o dos minutos.',
      },
      {
        title: 'Cargamos su menú con usted',
        text: () =>
          'Nos comparte su carta (platos, precios, fotos y extras) y la dejamos lista en su cuenta.',
      },
      {
        title: 'Reciba pedidos y premie a sus clientes',
        text: () =>
          'Sus clientes piden con su cuenta, los pedidos llegan a su tablero y cada compra entregada les suma puntos.',
      },
    ],
  },

  identity: {
    eyebrow: 'Diferenciación',
    title: 'Una experiencia digital que lleva el nombre de su restaurante.',
    pillars: [
      {
        title: 'Identidad',
        text: 'Su logo, sus colores y sus fotos. Para el cliente, la app es de su restaurante.',
      },
      {
        title: 'Pedidos directos',
        text: 'El pedido va de su cliente a su cocina, y el pago se hace en su local.',
      },
      {
        title: 'Fidelización',
        text: 'Puntos propios que solo se ganan y se canjean en su restaurante.',
      },
    ],
    caption: 'Carolina Hot Chicken ya recibe pedidos con Ventea. Capturas de su app, con su marca.',
  },

  pricing: {
    eyebrow: 'Precios y planes',
    title: 'Una tarifa fija. Cero comisión por pedido.',
    lead: (days) =>
      `Todos los planes empiezan con ${days} días gratis, sin tarjeta. Cambie de plan cuando lo necesite.`,
    loadingLabel: 'Cargando precios',
    loadError: 'No pudimos cargar los precios.',
    recommended: 'Recomendado',
    per: { month: 'mes', year: 'año' },
    yearlyNote: (monthly, savings) => `Equivale a ${monthly} al mes · ahorra ${savings}`,
    monthlyNote: (yearly) => `O ${yearly} al año, con 2 meses gratis`,
    cta: (plan) => `Probar ${plan} gratis`,
    ctaSuffix: (days) => ` durante ${days} días`,
    fine: 'Precios en dólares estadounidenses (USD). Sin costo de instalación ni permanencia. El pago del plan se coordina con nuestro equipo al terminar la prueba.',
  },

  toggle: {
    legend: 'Forma de pago',
    monthly: 'Mensual',
    yearly: 'Anual',
    yearlyExtra: '2 meses gratis',
  },

  plans: {
    // En español, el nombre que manda la API (Básico, Pro, Cadena).
    names: {},
    taglines: {
      basic: 'Para empezar a vender directo con su marca.',
      pro: 'Su propia app en las tiendas y hasta 3 sucursales.',
      chain: 'Para cadenas con varias sucursales.',
    },
    locations: (max) =>
      max === null ? 'Sucursales ilimitadas' : max === 1 ? '1 sucursal' : `Hasta ${max} sucursales`,
    staff: (max) =>
      max === null
        ? 'Usuarios ilimitados'
        : max === 1
          ? '1 usuario del equipo'
          : `Hasta ${max} usuarios del equipo`,
    features: {
      ownAddress: 'Pedidos en su dirección propia en ventea.tech',
      board: 'Panel de pedidos con aviso sonoro',
      points: 'Puntos de lealtad para sus clientes',
      brandedApp: 'App con su marca para Android y iOS',
      customDomain: 'Su propio dominio',
      reports: 'Reportes de ventas',
      prioritySupport: 'Soporte prioritario',
    },
  },

  faq: {
    eyebrow: 'Preguntas frecuentes',
    title: 'Lo que suelen preguntarnos',
    leadBefore: '¿Otra pregunta? Escríbanos a ',
    questions: (v) => [
      {
        q: '¿Cómo funciona Ventea?',
        a: 'Registra su restaurante, cargamos su menú con usted y sus clientes piden desde la experiencia con su marca. Los pedidos llegan al tablero de su cocina, su equipo los avanza de «Nuevos» a «En cocina» y «Listos», y cada pedido entregado le suma puntos al cliente.',
      },
      {
        q: '¿Qué significa tener una app propia?',
        a: 'Que su cliente pide en una experiencia con el nombre, el logo y los colores de su restaurante, no en una lista junto a otros. Todos los planes incluyen su dirección propia en ventea.tech; en los planes Pro y Cadena preparamos además su app para Android y iOS con su marca.',
      },
      {
        q: '¿Cómo reciben los pedidos los restaurantes?',
        a: 'En el panel de pedidos, desde el navegador de una computadora, tableta o teléfono. Cada pedido nuevo aparece solo, resaltado y con aviso sonoro si lo activa. Hoy los pedidos son para llevar o para comer en el local, y el cliente paga al retirar; no hay delivery ni pago en línea dentro de Ventea.',
      },
      {
        q: '¿Cómo funcionan los puntos?',
        a: `Con la configuración inicial, su cliente gana 1 punto por cada unidad de moneda del pedido (1 punto por lempira) cuando el pedido se entrega, más ${v.bonus} puntos de bienvenida al crear su cuenta. Puede canjearlos desde ${v.minToRedeem} puntos como descuento en un pedido; cada punto vale 1 centavo. Si un pedido se cancela, los puntos canjeados vuelven a su saldo.`,
      },
      {
        q: '¿Existen comisiones por pedido?',
        a: 'No. Ventea no cobra comisión por pedido: paga solo la tarifa fija de su plan, venda lo que venda. Si en el futuro cobra con tarjeta a través de un procesador de pagos, la comisión de ese procesador es aparte y la pacta usted con él.',
      },
      {
        q: '¿Qué costos tiene el servicio?',
        a: `El precio de su plan, en dólares (USD), mes a mes o por año; el pago anual equivale a diez meses. Sin costo de instalación ni permanencia. Todos los planes empiezan con ${v.days} días gratis, sin tarjeta. Hoy el pago se coordina con nuestro equipo: en la sección Facturación de su panel ve hasta cuándo dura su prueba, y para activar su plan nos escribe y coordinamos el pago con usted.`,
      },
      {
        q: '¿Cómo empieza el registro?',
        a: 'En tres pasos: elige su plan, escribe el nombre de su restaurante y su dirección (su-restaurante.ventea.tech), y crea su cuenta. Su panel queda listo al momento y la dirección se activa en uno o dos minutos.',
      },
      {
        q: '¿Qué dispositivos se necesitan?',
        a: 'Para el panel, cualquier computadora, tableta o teléfono con un navegador actualizado y conexión a internet. Sus clientes piden desde su teléfono.',
      },
      {
        q: '¿Puedo cancelar cuando quiera?',
        a: 'Sí, desde la sección Facturación de su panel. No hay permanencia ni multas. Si cancela, su servicio sigue funcionando hasta el final del período que ya pagó.',
      },
    ],
  },

  demo: {
    eyebrow: 'Demostración',
    title: '¿Prefiere que se la mostremos?',
    lead: 'Cuéntenos de su restaurante y le mostramos Ventea en una llamada corta, con sus preguntas.',
    name: 'Su nombre',
    restaurant: 'Nombre del restaurante',
    city: 'Ciudad y país (opcional)',
    phone: 'Teléfono o WhatsApp (opcional)',
    message: '¿Algo que quiera contarnos? (opcional)',
    submit: 'Pedir una demo',
    hint: (email) => `Se abre su correo con el mensaje listo para enviar a ${email}.`,
    sentBefore: 'Si su correo no se abrió, escríbanos directo a ',
    nameError: 'Escriba su nombre.',
    restaurantError: 'Escriba el nombre de su restaurante.',
    mail: {
      subject: 'Quiero una demo de Ventea',
      greeting: 'Hola, quiero ver una demo de Ventea.',
      name: 'Nombre',
      restaurant: 'Restaurante',
      city: 'Ciudad y país',
      phone: 'Teléfono o WhatsApp',
    },
  },

  final: {
    title: 'Su restaurante tiene una marca.',
    titleAccent: 'Es hora de llevarla más lejos.',
    primaryCta: 'Empezar con Ventea',
    secondaryCta: 'Pedir una demostración',
    fine: (days) => `${days} días gratis · Sin tarjeta · 0% de comisión por pedido`,
  },

  footer: {
    about:
      'App propia, pedidos directos y puntos de lealtad para restaurantes. Sin comisión por pedido.',
    productTitle: 'Producto',
    links: {
      experience: 'Experiencia del cliente',
      orders: 'Pedidos directos',
      points: 'Programa de puntos',
      pricing: 'Precios',
      faq: 'Preguntas frecuentes',
      signup: 'Registrar mi restaurante',
    },
    contactTitle: 'Contacto',
    contactBefore: '¿Dudas o quiere una demostración? Escríbanos a ',
    legalTitle: 'Legal',
    terms: 'Términos del servicio',
    privacy: 'Política de privacidad',
    madeBy: 'Un producto de',
    corporate: 'Ventea, software y arquitectura',
  },

  panelAccess: {
    label: 'Entrar a mi panel',
    placeholder: 'su-restaurante',
    go: 'Ir',
    error: 'Escriba la dirección de su restaurante, por ejemplo: mi-restaurante.',
    hint: 'La dirección que eligió al registrarse.',
  },

  whatsapp: {
    message: 'Hola, quiero saber más de Ventea para mi restaurante.',
    label: 'Escríbenos por WhatsApp',
  },

  signup: {
    stepTitles: ['Elige tu plan', 'Tu restaurante', 'Tu cuenta'],
    kicker: (days) => `Prueba ${days} días gratis · sin tarjeta`,
    stepperLabel: 'Pasos del registro',
    stepOf: (step) => `Paso ${step} de 3: `,
    closedStrong: 'Registro temporalmente cerrado, escríbenos.',
    closedBefore: ' Recibimos muchas altas hoy. Escríbenos a ',
    closedAfter: ' y te abrimos tu cuenta.',
    maybeCreatedStrong: 'Puede que tu restaurante ya se haya creado.',
    maybeCreatedBefore: ' El envío anterior se cortó antes de recibir respuesta. Intenta entrar a ',
    maybeCreatedMiddle:
      ' con tu correo y la contraseña que elegiste. Si no funciona, escríbenos a ',
    restaurantName: 'Nombre del restaurante',
    slugLabel: 'Dirección web',
    slugPreviewBefore: 'Tus clientes van a pedir en ',
    slugPlaceholder: 'tu-restaurante',
    slugChecking: 'Espera un segundo: estamos revisando la dirección.',
    ownerName: 'Tu nombre',
    email: 'Correo',
    emailHint: 'Con este correo entras al panel de tu restaurante.',
    acceptTerms: 'Acepto los términos y la política de privacidad',
    readFirst: 'Léelos antes: ',
    termsLink: 'Términos del servicio',
    privacyLink: 'Política de privacidad',
    newTab: ' (se abre en otra pestaña)',
    honeypot: 'No completar',
    summaryBefore: 'Plan ',
    summaryAfter: (interval, price) =>
      ` ${interval === 'year' ? 'anual' : 'mensual'}: ${price} USD al terminar la prueba. Hoy no pagas nada.`,
    back: 'Atrás',
    continue: 'Continuar',
    creating: 'Creando tu restaurante…',
    create: 'Crear mi restaurante',
    loadingPlans: 'Cargando planes…',
    plansError: 'No pudimos cargar los planes.',
    planLegend: 'Plan',
    brandedApp: ' · app con tu marca',
    per: { month: 'mes', year: 'año' },
    ready: {
      checking: 'Preparando tu dirección segura… (puede tardar hasta 2 minutos)',
      ready: '¡Tu dirección ya está lista! Ya puedes entrar a tu panel.',
      slow: 'Está tardando más de lo normal. Intenta entrar en unos minutos con el botón de abajo.',
    },
    slowBefore: ' Si sigue sin abrir, escríbenos a ',
    doneTitle: (restaurant) => `¡Listo! ${restaurant} ya está en Ventea`,
    enterPanel: 'Entrar a mi panel',
    pageLabel: 'Tu página de pedidos',
    userLabel: 'Usuario del panel',
    trialEnds: 'Tu prueba gratis termina',
    errors: {
      name: 'Escribe el nombre de tu restaurante.',
      owner: 'Escribe tu nombre.',
      email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
      password: (min) => `La contraseña necesita al menos ${min} caracteres.`,
      terms:
        'Para crear tu restaurante tienes que aceptar los términos y la política de privacidad.',
      taken: 'Esa dirección ya la tomó otro restaurante. Elige otra para continuar.',
      slugInvalid: 'Revisa el nombre y la dirección: alguno no tiene el formato correcto.',
      slugApi: (message) => `${message.replace(/\.$/, '')}. Elige otra dirección.`,
      dataInvalid: 'Revisa tus datos: algún campo no tiene el formato correcto.',
      dataApi: (message) => `Revisa tus datos: ${message}`,
      server: 'Algo falló de nuestro lado. Intenta de nuevo en unos minutos.',
      other: (message) => message,
    },
    slug: {
      empty: 'Elige la dirección de tu restaurante.',
      checking: 'Revisando si está libre…',
      available: '¡Está libre!',
      taken: 'Esa dirección ya la usa otro restaurante. Prueba con otra.',
      reserved: 'Esa dirección está reservada. Prueba con otra.',
      invalid: 'Usa de 3 a 63 letras minúsculas, números o guiones (sin espacios ni acentos).',
      unknown: 'No pudimos revisarla ahora; la confirmamos al crear tu cuenta.',
    },
  },

  password: {
    label: 'Contraseña',
    show: 'Mostrar',
    hide: 'Ocultar',
    hintEmpty: (min) => `Mínimo ${min} caracteres. Mezcla mayúsculas, números y símbolos.`,
    missing: (n) => `Faltan ${n} ${n === 1 ? 'carácter' : 'caracteres'}.`,
    strength: (label) => `Seguridad: ${label}.`,
    strengthLabels: ['Muy corta', 'Aceptable', 'Buena', 'Fuerte', 'Muy fuerte'],
  },
};
