/*
 * Borrador — revisar con asesoría legal.
 *
 * Términos del servicio de Ventea (TASK-007). Redactados para ser claros, no como texto
 * definitivo: antes de cobrar en serio, un abogado tiene que revisarlos (ley hondureña de
 * comercio electrónico, protección al consumidor y datos personales). Al cambiar el fondo,
 * publicar una versión nueva: agregarla a `TERMS_VERSIONS` en @ventea/shared y actualizar
 * `TERMS_VERSION` y `LEGAL_UPDATED_LABEL` en `src/site.ts`.
 *
 * Regla (review TASK-007): describir SOLO lo que el producto hace hoy. No hay correos
 * automáticos (BillingNotifier solo registra), ni facturación electrónica, ni purga
 * automática de datos, y el pago se coordina con el equipo (BILLING_MODE=manual). Los avisos
 * al dueño se ven en la sección Facturación de su panel.
 */
import {
  CONTACT_EMAIL,
  LEGAL_COUNTRY,
  LEGAL_NAME,
  SITE_URL,
  TERMS_VERSION,
  TRIAL_DAYS,
} from '@/config';

import { LegalLayout, type LegalSection } from './LegalLayout';

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: 'servicio',
    title: 'El servicio',
    body: (
      <>
        <p>
          Ventea es una plataforma en línea para restaurantes: página de pedidos con tu marca en una
          dirección propia (por ejemplo, <em>turestaurante.ventea.tech</em>), panel de cocina,
          programa de puntos para tus clientes y, según el plan, una app con tu marca para Android e
          iOS. Lo prestamos como un servicio por suscripción: no vendemos licencias ni cobramos
          comisión por pedido.
        </p>
        <p>
          Lo que incluye cada plan (sucursales, app propia, dominio propio, reportes, soporte) es el
          que se publica en <a href={`${SITE_URL}/#precios`}>la sección de precios</a> al momento de
          contratarlo.
        </p>
      </>
    ),
  },
  {
    id: 'cuenta',
    title: 'Tu cuenta',
    body: (
      <ul>
        <li>
          Para registrarte tienes que ser mayor de edad y tener facultad para contratar en nombre
          del restaurante.
        </li>
        <li>
          Los datos del registro tienen que ser verdaderos y estar al día. Tú eres responsable de
          guardar tu contraseña y de lo que hagan las personas a las que des acceso a tu panel.
        </li>
        <li>
          Si sospechas que alguien entró a tu cuenta sin permiso, escríbenos de inmediato a {mail}.
        </li>
      </ul>
    ),
  },
  {
    id: 'prueba',
    title: `Prueba gratis de ${TRIAL_DAYS} días`,
    body: (
      <p>
        Al registrarte empiezas una prueba gratis de {TRIAL_DAYS} días del plan que elegiste, sin
        tarjeta. Durante la prueba puedes usar el servicio completo. En la sección Facturación de tu
        panel ves en todo momento hasta cuándo dura tu prueba y cómo activar tu plan. Si no lo
        activas, al vencer la prueba tu página deja de recibir pedidos y no se te cobra nada.
      </p>
    ),
  },
  {
    id: 'precios',
    title: 'Planes, precios y pago',
    body: (
      <ul>
        <li>
          Los precios están en dólares estadounidenses (USD) y se pagan por adelantado, por mes o
          por año, según el intervalo que elijas.
        </li>
        <li>
          Hoy el pago se coordina con el equipo de Ventea (por ejemplo, por transferencia):
          escríbenos a {mail} y te indicamos cómo pagar. Cuando registramos tu pago, lo ves en la
          sección Facturación de tu panel.
        </li>
        <li>
          Los impuestos que correspondan según la ley se suman al precio cuando apliquen. Si
          necesitas un comprobante de pago, pídelo por escrito a {mail}.
        </li>
        <li>
          Cuando habilitemos el pago con tarjeta, el cobro lo procesará un proveedor de pagos y
          nosotros no guardaremos el número de tu tarjeta: solo una referencia (token), la marca y
          los últimos cuatro dígitos.
        </li>
        <li>
          Podemos cambiar los precios. Un cambio de precio se anuncia en esta página y en tu panel
          con al menos 30 días de anticipación y se aplica desde tu siguiente renovación.
        </li>
      </ul>
    ),
  },
  {
    id: 'renovacion',
    title: 'Renovación automática',
    body: (
      <p>
        Tu suscripción se renueva al final de cada período (mes o año) por el mismo plan e
        intervalo, salvo que la canceles antes. La fecha de renovación y el monto se ven en la
        sección Facturación de tu panel.
      </p>
    ),
  },
  {
    id: 'cancelacion',
    title: 'Cancelación',
    body: (
      <>
        <p>
          Puedes cancelar cuando quieras desde la sección Facturación de tu panel o escribiéndonos.
          No hay permanencia mínima ni multas.
        </p>
        <p>
          La cancelación se hace efectiva al final del período que ya pagaste: hasta ese día tu
          servicio sigue funcionando con normalidad. No hacemos devoluciones por la parte no usada
          de un período, salvo cuando la ley aplicable lo exija.
        </p>
      </>
    ),
  },
  {
    id: 'falta-de-pago',
    title: 'Falta de pago y suspensión',
    body: (
      <>
        <p>
          Si el pago de una renovación no llega, tu suscripción queda con un pago pendiente: lo ves
          como aviso en la sección Facturación de tu panel. Si después de unos días el pago no se
          completa, suspendemos el servicio.
        </p>
        <p>
          Con el servicio suspendido tu página y tu app dejan de recibir pedidos, pero tú sigues
          pudiendo entrar a tu panel. Para reactivarlo, escríbenos a {mail}: al registrar tu pago el
          servicio vuelve a funcionar. Tus datos se conservan como se explica en la{' '}
          <a href="/privacidad#retencion">política de privacidad</a>.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Tus datos y los de tus clientes',
    body: (
      <>
        <p>
          El menú, las fotos, los precios y la información de tu restaurante son tuyos. Nos das
          permiso para guardarlos y mostrarlos en tu página y tu app con el único fin de prestar el
          servicio.
        </p>
        <p>
          Los datos de tus clientes (nombre, correo, teléfono, direcciones, pedidos y puntos) son de
          tu restaurante: tú eres el responsable de su tratamiento y nosotros los tratamos por
          cuenta tuya, solo para prestarte el servicio. No los vendemos ni los usamos para contactar
          a tus clientes con fines propios. El detalle está en la{' '}
          <a href="/privacidad">política de privacidad</a>.
        </p>
        <p>
          Te comprometes a informar a tus clientes sobre cómo usas sus datos y a cumplir las normas
          de protección de datos que te apliquen.
        </p>
      </>
    ),
  },
  {
    id: 'uso',
    title: 'Uso aceptable',
    body: (
      <>
        <p>No está permitido usar Ventea para:</p>
        <ul>
          <li>vender productos o servicios ilegales o engañar a tus clientes;</li>
          <li>hacerse pasar por otro restaurante o por Ventea;</li>
          <li>enviar mensajes no solicitados (spam) a través del servicio;</li>
          <li>
            intentar acceder a datos de otros restaurantes o afectar el funcionamiento de la
            plataforma.
          </li>
        </ul>
        <p>
          Si detectamos un uso así podemos suspender la cuenta, avisándote salvo que la gravedad del
          caso no lo permita.
        </p>
      </>
    ),
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad y cambios del servicio',
    body: (
      <p>
        Trabajamos para que Ventea esté disponible todo el tiempo, pero puede haber interrupciones
        por mantenimiento, fallas de proveedores o causas fuera de nuestro control. Podemos mejorar
        o cambiar funciones; si quitamos algo importante de tu plan, lo anunciamos en esta página y
        en tu panel con anticipación.
      </p>
    ),
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    body: (
      <p>
        El software, la marca Ventea y el diseño de la plataforma son de {LEGAL_NAME}. La
        suscripción te da derecho a usarlos mientras esté vigente, no a copiarlos ni revenderlos. Tu
        marca, tu logo y tu contenido siguen siendo tuyos.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Límites de responsabilidad',
    body: (
      <>
        <p>
          Ventea es una herramienta: la preparación, la entrega, la calidad de los productos y la
          atención a tus clientes son responsabilidad de tu restaurante.
        </p>
        <p>
          En la medida que lo permita la ley, no respondemos por ganancias perdidas ni daños
          indirectos, y nuestra responsabilidad total frente a ti por cualquier reclamo se limita a
          lo que nos hayas pagado en los 12 meses anteriores al hecho que lo origina.
        </p>
      </>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a estos términos',
    body: (
      <p>
        Si cambiamos estos términos de forma importante, lo anunciamos en esta página y en tu panel
        con al menos 15 días de anticipación. Si no estás de acuerdo, puedes cancelar antes de que
        entren en vigor. Versión vigente: {TERMS_VERSION}.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable',
    body: (
      <p>
        Estos términos se rigen por las leyes de la República de {LEGAL_COUNTRY}. Antes de acudir a
        los tribunales competentes de {LEGAL_COUNTRY}, las partes intentarán resolver cualquier
        diferencia de buena fe, por escrito.
      </p>
    ),
  },
  {
    id: 'contacto',
    title: 'Contacto',
    body: (
      <p>
        Para cualquier pregunta sobre estos términos escríbenos a {mail}. El servicio lo presta{' '}
        {LEGAL_NAME}.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      title="Términos del servicio"
      intro={
        <p>
          Estas son las reglas para usar Ventea. Las escribimos en lenguaje claro: si algo no se
          entiende, pregúntanos. Al crear tu restaurante en Ventea aceptas estos términos y la{' '}
          <a href="/privacidad">política de privacidad</a>.
        </p>
      }
      sections={SECTIONS}
      other={{ href: '/privacidad', label: 'política de privacidad' }}
    />
  );
}
