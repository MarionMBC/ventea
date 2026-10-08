/*
 * Borrador — revisar con asesoría legal.
 *
 * Política de privacidad de Ventea (TASK-007). Describe lo que el producto hace hoy (ver
 * apps/api/prisma/schema.prisma): si cambia qué datos se guardan o con quién se comparten,
 * actualizar este texto y publicar una versión nueva (`TERMS_VERSIONS` en @ventea/shared,
 * `TERMS_VERSION` y `LEGAL_UPDATED_LABEL` en `src/site.ts`).
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
          <strong>Suscripción y pagos:</strong> plan, fechas, pagos y facturas. Si pagas con
          tarjeta, solo una referencia del procesador de pagos (token), la marca y los últimos
          cuatro dígitos; nunca el número completo ni el código de seguridad.
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
            el identificador del dispositivo para avisarle del estado de su pedido, si lo autoriza.
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
        <li>avisarte de cosas importantes de tu cuenta (prueba, cobros, cambios del servicio);</li>
        <li>dar soporte cuando nos escribes;</li>
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
          funcionar, que los tratan por cuenta nuestra y con obligación de confidencialidad:
        </p>
        <ul>
          <li>alojamiento y bases de datos en la nube;</li>
          <li>procesador de pagos, para cobrar la suscripción;</li>
          <li>envío de correos y notificaciones.</li>
        </ul>
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
        <li>Mientras tu cuenta esté activa, guardamos los datos necesarios para el servicio.</li>
        <li>
          Si cancelas o tu cuenta queda suspendida, conservamos los datos hasta 90 días por si
          vuelves; después los borramos o los dejamos anónimos, salvo lo que debamos guardar por ley
          (por ejemplo, registros de pagos y facturas).
        </li>
        <li>Puedes pedirnos que borremos tu cuenta antes: escríbenos a {mail}.</li>
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
        datos, te avisaremos sin demora y te diremos qué hacer.
      </p>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <p>
          Puedes pedirnos acceso a tus datos, corregirlos, borrarlos, oponerte a un uso o recibirlos
          en un formato que puedas llevarte. Escríbenos a {mail} desde el correo de tu cuenta; te
          respondemos en un plazo máximo de 15 días hábiles.
        </p>
      </>
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
        Si cambiamos esta política de forma importante, te avisamos por correo antes de que el
        cambio entre en vigor y actualizamos la fecha de arriba.
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
