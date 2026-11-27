import type { Language } from '../../brand/brandConfig';

/*
 * Privacy policy and terms of use of every brand app (App Store 5.1.1, Play «Data safety»).
 * Served in the app (Profile) and on the web at `/privacy`, `/terms` and `/support` of the brand's
 * host, which are the URLs given to the stores (`/support` is the store «Support URL»).
 *
 * Rule: describe only what the product does today (apps/api/prisma/schema.prisma). If the data
 * kept, the providers or the deletion flow change, update this text and `LEGAL_UPDATED`.
 * `{brand}` is the restaurant's name.
 */

export type LegalDoc = 'privacy' | 'terms' | 'support';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalText {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** Platform operator: processes the data on behalf of the restaurant. */
export const LEGAL_OPERATOR = 'Ventea';
export const LEGAL_CONTACT_EMAIL = 'hola@ventea.tech';
/** ISO date of the current version. */
export const LEGAL_UPDATED = '2026-11-26';

const en: Record<LegalDoc, LegalText> = {
  privacy: {
    title: 'Privacy Policy',
    intro:
      'This policy explains what personal data the {brand} app and website collect, why, who we share it with and how you can see or delete it.',
    sections: [
      {
        title: 'Who is responsible',
        paragraphs: [
          '{brand} (the restaurant) is responsible for the personal data of its customers. The app is built and operated for the restaurant by {operator}, which processes the data only on the restaurant’s behalf and to provide the service.',
          'Questions or requests: {email}.',
        ],
      },
      {
        title: 'Data we collect',
        bullets: [
          'Account: first name, last name, email and, if you add it, your phone number. Your password is stored hashed, never in plain text.',
          'Orders: products, options, amounts, notes, pickup location and status of each order.',
          'Rewards: points earned and redeemed.',
          'Device: if you allow notifications, a push token so we can tell you when your order changes status, and the device platform (iOS or Android).',
          'Technical logs: like any web server, ours records connection data (such as the IP address) for security and to limit abuse.',
        ],
        paragraphs: [
          'We do not collect your location, contacts, photos or payment card data. We do not use advertising, analytics or tracking tools, and we do not track you across other companies’ apps or websites.',
        ],
      },
      {
        title: 'How we use it',
        bullets: [
          'to create and manage your account;',
          'to receive, prepare and hand over your orders, and to notify you about them;',
          'to run the rewards program;',
          'to answer you when you contact us;',
          'to protect the service against fraud and abuse, and to comply with the law.',
        ],
      },
      {
        title: 'Who we share it with',
        paragraphs: [
          'We do not sell or rent personal data. We share it only with the providers the service needs, who process it on our behalf under confidentiality: cloud hosting for servers and databases, and the push notification services of Apple (APNs) and Google (Firebase Cloud Messaging). We may also disclose data when a competent authority requires it by law.',
        ],
      },
      {
        title: 'How long we keep it',
        paragraphs: [
          'We keep your data while your account exists. When you delete your account, we delete your profile, your points and your devices at once. Your past orders stay in the restaurant’s records without your name or email, because the restaurant needs them for its accounting.',
        ],
      },
      {
        title: 'Deleting your account',
        paragraphs: [
          'In the app, open Profile → Delete account and confirm. The deletion is immediate and cannot be undone. If you have an order in progress, you can delete the account once it is completed or cancelled. You can also ask for it by writing to {email} from the email of your account.',
        ],
      },
      {
        title: 'Your rights',
        paragraphs: [
          'You can see and edit your details in the app, and you can ask us for a copy of your data, to correct it, to delete it or to stop a particular use, by writing to {email}. We answer in writing within 30 days.',
        ],
      },
      {
        title: 'Security',
        paragraphs: [
          'All connections are encrypted (HTTPS), passwords are hashed, each restaurant’s data is kept separate and the database is backed up daily. No system is infallible: if an incident affects your data, we will tell you and explain what to do.',
        ],
      },
      {
        title: 'Children',
        paragraphs: [
          'The app is not directed at children under 13 and we do not knowingly collect their data. If you believe a child has created an account, write to {email} and we will delete it.',
        ],
      },
      {
        title: 'Changes',
        paragraphs: [
          'If we change this policy, we will publish the new version here with its date and, if the change is important, we will tell you in the app.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Use',
    intro:
      'These terms apply to the use of the {brand} app and website. By creating an account or placing an order you accept them.',
    sections: [
      {
        title: 'The service',
        paragraphs: [
          'The app lets you browse the menu of {brand}, place orders for pickup at its locations, follow their status and take part in its rewards program. {brand} is responsible for the menu, prices, preparation and delivery of the orders. The app is operated for the restaurant by {operator}.',
        ],
      },
      {
        title: 'Your account',
        bullets: [
          'You must give true details and keep your password safe; you are responsible for what is done with your account.',
          'You must be at least 13 years old to create an account.',
          'You can delete your account at any time from Profile → Delete account.',
        ],
      },
      {
        title: 'Orders and prices',
        bullets: [
          'Prices, products and opening hours are set by the restaurant and may change; the price that applies is the one shown when you confirm the order.',
          'An order is accepted when the app confirms it. The restaurant may cancel an order it cannot prepare, and will tell you through the app.',
          'If the restaurant allows it, you can cancel an order from the app within the time shown on the order.',
          'Payment is made at the restaurant, according to its methods.',
        ],
      },
      {
        title: 'Rewards program',
        paragraphs: [
          'Points have no cash value, cannot be transferred or sold, and are used only at {brand}. The restaurant sets and may change the rules (points per purchase, value and minimum to redeem). Points are lost when the account is deleted, and the restaurant may reverse points obtained by fraud or error.',
        ],
      },
      {
        title: 'Acceptable use',
        paragraphs: [
          'Do not use the app for false orders, to interfere with its operation, to access other people’s accounts or to copy its content. We may suspend accounts that do.',
        ],
      },
      {
        title: 'Content',
        paragraphs: [
          'The name, logo, photos and menu belong to {brand}. The app software belongs to {operator}. Using the app gives you no rights over them beyond using the service.',
        ],
      },
      {
        title: 'Liability',
        paragraphs: [
          'We work to keep the app available and correct, but it is provided “as is” and may have interruptions or errors. To the extent the law allows, we are not liable for indirect damages arising from its use. Nothing in these terms limits the rights the consumer law gives you.',
        ],
      },
      {
        title: 'Privacy',
        paragraphs: ['How we handle your data is described in the Privacy Policy.'],
      },
      {
        title: 'Changes and contact',
        paragraphs: [
          'We may update these terms; the new version is published here with its date. If you keep using the app after a change, you accept the new version. Questions: {email}.',
        ],
      },
    ],
  },
  support: {
    title: 'Support',
    intro:
      'Need help with the {brand} app? Write to us and we will answer by email. Here are the most common questions.',
    sections: [
      {
        title: 'Contact',
        paragraphs: [
          'Email: {email}. Please include the email of your account and, if it is about an order, the name of the location and the time you placed it.',
        ],
      },
      {
        title: 'Orders',
        bullets: [
          'Orders are for pickup: choose the location, add your items and place the order. You pay at the restaurant; the app does not charge your card.',
          'Open Orders in the app to follow the status of your order live. If you allowed notifications, we also tell you when it changes, for example when it is ready.',
          'To change or cancel an order, contact the restaurant or write to us as soon as possible.',
        ],
      },
      {
        title: 'Points',
        paragraphs: [
          'You earn points on your orders and can see them in Profile. How they are earned and redeemed is explained in the Terms of use. If your points do not look right, write to us with your account email and the order.',
        ],
      },
      {
        title: 'Your account and your data',
        bullets: [
          'To delete your account: open Profile → Delete account and confirm. The deletion is immediate and cannot be undone. If you have an order in progress, you can delete it once it is completed or cancelled.',
          'To see, correct or ask for a copy of your data, write to {email} from the email of your account.',
          'How we treat your data is explained in the Privacy policy.',
        ],
      },
      {
        title: 'Notifications',
        paragraphs: [
          'We only use notifications to tell you about the status of your orders. You can turn them off at any time in your phone settings; the app keeps working without them.',
        ],
      },
    ],
  },
};

const es: Record<LegalDoc, LegalText> = {
  privacy: {
    title: 'Política de privacidad',
    intro:
      'Esta política explica qué datos personales recogen la app y el sitio de {brand}, para qué, con quién los compartimos y cómo puedes verlos o borrarlos.',
    sections: [
      {
        title: 'Quién es responsable',
        paragraphs: [
          '{brand} (el restaurante) es responsable de los datos personales de sus clientes. {operator} construye y opera la app para el restaurante y trata los datos solo por cuenta de él y para prestar el servicio.',
          'Consultas o pedidos: {email}.',
        ],
      },
      {
        title: 'Qué datos recogemos',
        bullets: [
          'Cuenta: nombre, apellido, correo y, si lo agregas, tu teléfono. La contraseña se guarda cifrada, nunca en texto.',
          'Pedidos: productos, opciones, montos, notas, sucursal de retiro y estado de cada pedido.',
          'Puntos: los puntos ganados y canjeados.',
          'Dispositivo: si permites las notificaciones, un token para avisarte cuando tu pedido cambia de estado, y la plataforma del dispositivo (iOS o Android).',
          'Registros técnicos: como cualquier servidor web, el nuestro guarda datos de conexión (como la dirección IP) por seguridad y para limitar abusos.',
        ],
        paragraphs: [
          'No recogemos tu ubicación, contactos, fotos ni datos de tarjetas. No usamos herramientas de publicidad, analítica ni seguimiento, y no te rastreamos en apps o sitios de otras empresas.',
        ],
      },
      {
        title: 'Para qué los usamos',
        bullets: [
          'crear y administrar tu cuenta;',
          'recibir, preparar y entregar tus pedidos, y avisarte de ellos;',
          'llevar el programa de puntos;',
          'responderte cuando nos escribes;',
          'proteger el servicio contra fraudes y abusos, y cumplir la ley.',
        ],
      },
      {
        title: 'Con quién los compartimos',
        paragraphs: [
          'No vendemos ni alquilamos datos personales. Solo los compartimos con los proveedores que el servicio necesita, que los tratan por cuenta nuestra y con confidencialidad: el alojamiento en la nube de servidores y bases de datos, y los servicios de notificaciones de Apple (APNs) y Google (Firebase Cloud Messaging). También podemos entregarlos cuando una autoridad competente lo exija conforme a la ley.',
        ],
      },
      {
        title: 'Cuánto tiempo los guardamos',
        paragraphs: [
          'Guardamos tus datos mientras tu cuenta exista. Al borrar tu cuenta borramos de inmediato tu perfil, tus puntos y tus dispositivos. Tus pedidos anteriores quedan en los registros del restaurante sin tu nombre ni tu correo, porque los necesita para su contabilidad.',
        ],
      },
      {
        title: 'Borrar tu cuenta',
        paragraphs: [
          'En la app, entra a Perfil → Borrar cuenta y confirma. El borrado es inmediato y no se puede deshacer. Si tienes un pedido en curso, podrás borrar la cuenta cuando se complete o se cancele. También puedes pedirlo escribiendo a {email} desde el correo de tu cuenta.',
        ],
      },
      {
        title: 'Tus derechos',
        paragraphs: [
          'Puedes ver y editar tus datos en la app, y pedirnos una copia, corregirlos, borrarlos u oponerte a un uso escribiendo a {email}. Te respondemos por escrito en un plazo de 30 días.',
        ],
      },
      {
        title: 'Seguridad',
        paragraphs: [
          'Todas las conexiones van cifradas (HTTPS), las contraseñas se guardan cifradas, los datos de cada restaurante están separados y la base de datos se respalda a diario. Ningún sistema es infalible: si un incidente afecta tus datos, te lo diremos y te explicaremos qué hacer.',
        ],
      },
      {
        title: 'Menores de edad',
        paragraphs: [
          'La app no está dirigida a menores de 13 años y no recogemos sus datos a sabiendas. Si crees que un menor creó una cuenta, escribe a {email} y la borramos.',
        ],
      },
      {
        title: 'Cambios',
        paragraphs: [
          'Si cambiamos esta política, publicaremos aquí la versión nueva con su fecha y, si el cambio es importante, te avisaremos en la app.',
        ],
      },
    ],
  },
  terms: {
    title: 'Términos de uso',
    intro:
      'Estos términos se aplican al uso de la app y el sitio de {brand}. Al crear una cuenta o hacer un pedido los aceptas.',
    sections: [
      {
        title: 'El servicio',
        paragraphs: [
          'La app te permite ver el menú de {brand}, hacer pedidos para retirar en sus sucursales, seguir su estado y participar en su programa de puntos. {brand} es responsable del menú, los precios, la preparación y la entrega de los pedidos. {operator} opera la app para el restaurante.',
        ],
      },
      {
        title: 'Tu cuenta',
        bullets: [
          'Debes dar datos verdaderos y cuidar tu contraseña; eres responsable de lo que se haga con tu cuenta.',
          'Debes tener al menos 13 años para crear una cuenta.',
          'Puedes borrar tu cuenta cuando quieras desde Perfil → Borrar cuenta.',
        ],
      },
      {
        title: 'Pedidos y precios',
        bullets: [
          'Los precios, productos y horarios los fija el restaurante y pueden cambiar; vale el precio que se muestra al confirmar el pedido.',
          'Un pedido queda aceptado cuando la app lo confirma. El restaurante puede cancelar un pedido que no pueda preparar, y te avisará por la app.',
          'Si el restaurante lo permite, puedes cancelar un pedido desde la app dentro del tiempo que indica el pedido.',
          'El pago se hace en el restaurante, según sus medios de pago.',
        ],
      },
      {
        title: 'Programa de puntos',
        paragraphs: [
          'Los puntos no tienen valor en dinero, no se transfieren ni se venden y solo se usan en {brand}. El restaurante fija y puede cambiar las reglas (puntos por compra, valor y mínimo para canjear). Los puntos se pierden al borrar la cuenta, y el restaurante puede revertir puntos obtenidos por fraude o error.',
        ],
      },
      {
        title: 'Uso aceptable',
        paragraphs: [
          'No uses la app para pedidos falsos, para interferir con su funcionamiento, para entrar en cuentas ajenas ni para copiar su contenido. Podemos suspender las cuentas que lo hagan.',
        ],
      },
      {
        title: 'Contenido',
        paragraphs: [
          'El nombre, el logo, las fotos y el menú son de {brand}. El software de la app es de {operator}. Usar la app no te da derechos sobre ellos más allá de usar el servicio.',
        ],
      },
      {
        title: 'Responsabilidad',
        paragraphs: [
          'Trabajamos para que la app esté disponible y sea correcta, pero se ofrece «tal cual» y puede tener interrupciones o errores. En la medida que la ley lo permita, no respondemos por daños indirectos derivados de su uso. Nada en estos términos limita los derechos que te da la ley de protección al consumidor.',
        ],
      },
      {
        title: 'Privacidad',
        paragraphs: ['Cómo tratamos tus datos se explica en la Política de privacidad.'],
      },
      {
        title: 'Cambios y contacto',
        paragraphs: [
          'Podemos actualizar estos términos; la versión nueva se publica aquí con su fecha. Si sigues usando la app después de un cambio, aceptas la versión nueva. Consultas: {email}.',
        ],
      },
    ],
  },
  support: {
    title: 'Soporte',
    intro:
      '¿Necesitas ayuda con la app de {brand}? Escríbenos y te respondemos por correo. Aquí van las dudas más comunes.',
    sections: [
      {
        title: 'Contacto',
        paragraphs: [
          'Correo: {email}. Indica el correo de tu cuenta y, si es sobre un pedido, la sucursal y la hora en que lo hiciste.',
        ],
      },
      {
        title: 'Pedidos',
        bullets: [
          'Los pedidos son para recoger: elige la sucursal, agrega tus productos y haz el pedido. El pago se hace en el restaurante; la app no cobra tu tarjeta.',
          'Entra a Pedidos en la app para seguir el estado de tu pedido en vivo. Si permitiste las notificaciones, también te avisamos cuando cambia, por ejemplo cuando está listo.',
          'Para cambiar o cancelar un pedido, comunícate con el restaurante o escríbenos lo antes posible.',
        ],
      },
      {
        title: 'Puntos',
        paragraphs: [
          'Acumulas puntos con tus pedidos y los ves en Perfil. Cómo se ganan y se canjean está en los Términos de uso. Si tus puntos no cuadran, escríbenos con el correo de tu cuenta y el pedido.',
        ],
      },
      {
        title: 'Tu cuenta y tus datos',
        bullets: [
          'Para borrar tu cuenta: entra a Perfil → Borrar cuenta y confirma. El borrado es inmediato y no se puede deshacer. Si tienes un pedido en curso, podrás borrarla cuando se complete o se cancele.',
          'Para ver, corregir o pedir una copia de tus datos, escribe a {email} desde el correo de tu cuenta.',
          'Cómo tratamos tus datos se explica en la Política de privacidad.',
        ],
      },
      {
        title: 'Notificaciones',
        paragraphs: [
          'Usamos las notificaciones solo para avisarte del estado de tus pedidos. Puedes desactivarlas cuando quieras en los ajustes de tu teléfono; la app sigue funcionando sin ellas.',
        ],
      },
    ],
  },
};

const TEXTS: Record<Language, Record<LegalDoc, LegalText>> = { en, es };

const fill = (text: string, brand: string) => {
  const values: Record<string, string> = {
    brand,
    operator: LEGAL_OPERATOR,
    email: LEGAL_CONTACT_EMAIL,
  };
  return text.replace(/\{(brand|operator|email)\}/g, (_, name: string) => values[name] ?? '');
};

/** The document in `language`, with the brand's name filled in. */
export const legalText = (doc: LegalDoc, language: Language, brand: string): LegalText => {
  const source = TEXTS[language][doc];
  return {
    title: source.title,
    intro: fill(source.intro, brand),
    sections: source.sections.map((section) => ({
      title: section.title,
      paragraphs: section.paragraphs?.map((p) => fill(p, brand)),
      bullets: section.bullets?.map((b) => fill(b, brand)),
    })),
  };
};
