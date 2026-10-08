/*
 * Borrador — revisar con asesoría legal.
 *
 * Política de privacidad de Ventea (TASK-007). Describe lo que el producto hace hoy (ver
 * apps/api/prisma/schema.prisma): si cambia qué datos se guardan o con quién se comparten,
 * actualizar este texto y publicar una versión nueva (`TERMS_VERSIONS` en @ventea/shared,
 * `TERMS_VERSION` y `LEGAL_UPDATED_LABEL` en `src/site.ts`).
 *
 * Regla (review TASK-007): solo lo que existe hoy. Sin correos automáticos, sin facturas, sin
 * borrado automático por plazo: el borrado se hace a pedido, a mano.
 */
import { CONTACT_EMAIL, LEGAL_NAME } from '@/config';

import { LegalLayout, type LegalSection } from './LegalLayout';

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Quién trata tus datos',
    body: (
      <>
        <p>
          {LEGAL_NAME} («Ventea», «nosotros») es responsable de los datos de los restaurantes que
          usan la plataforma y de las personas que visitan el sitio de Ventea (app.ventea.tech y
          ventea.tech).
        </p>
        <p>
          Los datos de los clientes de cada restaurante son del restaurante: el restaurante es el
          responsable y Ventea actúa como <strong>encargado del tratamiento</strong>, es decir, los
          trata solo por cuenta del restaurante y para prestarle el servicio.
        </p>
      </>
    ),
  },
  {
    id: 'restaurante',
    title: 'Datos del restaurante',
    body: (
      <ul>
        <li>
          <strong>Cuenta:</strong> nombre y correo del dueño y de su equipo, y la contraseña
          (guardada cifrada, nunca en texto).
        </li>
        <li>
          <strong>Restaurante:</strong> nombre, dirección web, sucursales, horarios, menú, fotos,
          colores y logo.
        </li>
        <li>
          <strong>Suscripción y pagos:</strong> plan, fechas y pagos registrados (monto y
          referencia). Cuando habilitemos el pago con tarjeta, solo guardaremos una referencia del
          procesador de pagos (token), la marca y los últimos cuatro dígitos; nunca el número
          completo ni el código de seguridad.
        </li>
        <li>
          <strong>Aceptación de estos textos:</strong> la versión de los términos y de esta política
          que aceptaste al registrarte, y la fecha.
        </li>
      </ul>
    ),
  },
  {
    id: 'clientes',
    title: 'Datos de los clientes del restaurante',
    body: (
      <>
        <p>
          Cuando alguien pide en la página o la app de un restaurante, guardamos por cuenta de ese
          restaurante:
        </p>
        <ul>
          <li>nombre, correo y teléfono, si crea una cuenta o los da al pedir;</li>
          <li>direcciones de entrega;</li>
          <li>pedidos (productos, montos, notas y estado);</li>
          <li>puntos de lealtad ganados y canjeados;</li>
          <li>
            si usa la app y lo autoriza, el identificador de su teléfono y, si activa el ingreso con
            huella o rostro, una referencia a esa credencial (el dato biométrico nunca sale del
            teléfono).
          </li>
        </ul>
        <p>
          Cada restaurante solo ve los datos de sus propios clientes. Si eres cliente de un
          restaurante y quieres ejercer tus derechos, escríbele al restaurante; si no te responde,
          escríbenos a {mail} y lo ayudamos a atenderte.
        </p>
      </>
    ),
  },
  {
    id: 'visitas',
    title: 'Visitas al sitio de Ventea',
    body: (
      <>
        <p>
          No usamos cookies de seguimiento ni herramientas de publicidad. Para saber si la página
          funciona contamos de forma agregada, por día, cuántas visitas hay y cuántas personas
          avanzan en el registro. Ese conteo no guarda tu dirección IP, tu navegador ni ningún
          identificador.
        </p>
        <p>
          Como cualquier servidor web, el nuestro registra por un tiempo corto datos técnicos de las
          conexiones (como la dirección IP) para seguridad y para limitar abusos.
        </p>
      </>
    ),
  },
  {
    id: 'usos',
    title: 'Para qué usamos los datos',
    body: (
      <ul>
        <li>prestar el servicio: mostrar el menú, recibir pedidos y gestionar puntos;</li>
        <li>crear y administrar tu cuenta, tu suscripción y tus pagos;</li>
        <li>mostrarte en tu panel avisos de tu cuenta (prueba, pagos, cambios del servicio);</li>
        <li>responderte cuando nos escribes;</li>
        <li>proteger la plataforma contra fraudes y abusos, y cumplir obligaciones legales.</li>
      </ul>
    ),
  },
  {
    id: 'compartir',
    title: 'Con quién los compartimos',
    body: (
      <>
        <p>
          No vendemos datos personales. Solo los compartimos con proveedores que necesitamos para
          funcionar, que los tratan por cuenta nuestra y con obligación de confidencialidad: hoy, el
          alojamiento de servidores y bases de datos en la nube. Cuando habilitemos el pago con
          tarjeta, también el procesador de pagos.
        </p>
        <p>
          También podemos entregarlos cuando una autoridad competente lo exija conforme a la ley.
          Algunos proveedores pueden guardar datos en servidores fuera de Honduras; en ese caso
          exigimos medidas de seguridad equivalentes.
        </p>
      </>
    ),
  },
  {
    id: 'retencion',
    title: 'Cuánto tiempo los guardamos',
    body: (
      <ul>
        <li>Mientras tu cuenta exista, guardamos los datos necesarios para el servicio.</li>
        <li>
          Si cancelas o tu cuenta queda suspendida, los datos se conservan para que puedas volver.
          Si quieres que los borremos, pídelo por escrito a {mail} desde el correo de tu cuenta: lo
          hacemos en un plazo razonable y te confirmamos por escrito, salvo lo que debamos guardar
          por ley (por ejemplo, los registros de pagos).
        </li>
      </ul>
    ),
  },
  {
    id: 'seguridad',
    title: 'Seguridad',
    body: (
      <p>
        Usamos conexiones cifradas (HTTPS), contraseñas cifradas, accesos separados por restaurante
        y copias de seguridad. Ningún sistema es infalible: si ocurriera un incidente que afecte tus
        datos, te lo comunicaremos por escrito y te diremos qué hacer.
      </p>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <p>
        Puedes pedirnos acceso a tus datos, corregirlos, borrarlos, oponerte a un uso o recibirlos
        en un formato que puedas llevarte. Escríbenos a {mail} desde el correo de tu cuenta; te
        respondemos por escrito en un plazo razonable.
      </p>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: (
      <p>
        Ventea es un servicio para negocios. No está dirigido a menores de edad y no recogemos a
        sabiendas datos de menores para nuestros propios fines.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    body: (
      <p>
        Si cambiamos esta política de forma importante, lo anunciamos en esta página y en tu panel
        antes de que el cambio entre en vigor, y actualizamos la fecha de arriba.
      </p>
    ),
  },
  {
    id: 'contacto',
    title: 'Contacto',
    body: <p>Para cualquier pregunta sobre privacidad, escríbenos a {mail}.</p>,
  },
];

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      intro={
        <p>
          Aquí te contamos qué datos recogemos, para qué los usamos, con quién los compartimos y
          cómo puedes ejercer tus derechos. Sin letra pequeña: si algo no queda claro, escríbenos.
        </p>
      }
      sections={SECTIONS}
      other={{ href: '/terminos', label: 'términos del servicio' }}
    />
  );
}
