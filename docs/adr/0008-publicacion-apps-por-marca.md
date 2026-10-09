# 0008 — Quién publica la app nativa de cada marca

**Estado**: aceptada · 2026-10-09

## Contexto

Los planes Pro y Cadena incluyen «app propia con marca» ([ADR 0007](0007-saas-multi-tenant.md)).
Desde TASK-016 el dueño la pide desde Mi marca y la plataforma la opera (`AppConfig`: bundle id,
quién publica, estado, versión, links de tienda). Falta decidir en qué cuenta de developer sale
cada binario. [white-label.md](../white-label.md) dejaba la pregunta abierta «antes del segundo
cliente».

Las dos opciones:

- **Cuenta de Ventea:** una sola cuenta de Apple y una de Google; publicamos todo. Simple de
  operar y rápido para el cliente. Riesgo: la guía 4.2.6 de Apple rechaza las apps «creadas a
  partir de una plantilla o un servicio de generación de apps» si las publica el proveedor de la
  plantilla en vez del negocio, salvo que cada una tenga diferenciación real.
- **Cuenta del cliente:** la app sale a nombre de la marca (lo que Apple pide para apps de
  plantilla), pero cada publicación depende de que el cliente tenga cuenta, pague la membresía y
  nos dé acceso; son N cuentas que gestionar.

## Decisión

- **Plan Pro → cuenta de Ventea** (`publisher = ventea`). El cliente chico no tiene ni quiere
  una cuenta de developer; el precio del plan no paga gestionar la suya.
- **Plan Cadena → cuenta del cliente por defecto** (`publisher = client`). La app sale a nombre
  de la marca, que es lo que una cadena espera y lo que más protege frente a 4.2.6.
- **La plataforma puede cambiar `publisher`** en cualquier marca (`PATCH
/api/platform/tenants/:slug/app`): un Pro con cuenta propia, o una Cadena que todavía no la
  tiene y sale primero por la nuestra.
- El `bundleId` (`app.ventea.<slug>` por defecto) lo fija la plataforma y es único en todas las
  marcas. Una app publicada en la cuenta de un cliente puede llevar el prefijo de su dominio.

## Mitigación de 4.2.6 (cuenta de Ventea)

Cada app que publicamos tiene que poder defenderse como un negocio distinto, no como una plantilla
repetida:

- nombre, ícono, colores, capturas y descripción propios de la marca (la checklist exige ícono
  y descripción corta antes de pasar a `building`);
- contenido real y propio: menú, fotos, sucursales y programa de puntos de la marca;
- funcionalidad nativa (push de estado del pedido, puntos) además del menú;
- en la revisión, explicar que es la app oficial del restaurante y que el restaurante es el
  responsable del contenido.

Si Apple rechaza por 4.2.6, la salida es mover esa marca a su propia cuenta (`publisher =
client`), no insistir con la nuestra. Si los rechazos se repiten, el siguiente paso es escalar a
cuentas por cliente para todo plan con app, o publicar con el programa de Apple para apps de
empresas a medida.

## Consecuencias

- Ventea es el responsable ante las tiendas de las apps Pro: su contenido y sus datos personales
  (política de privacidad por marca, borrado de cuenta) entran en nuestra operación.
- Cada marca necesita su propio proyecto de Firebase para push (el token está atado al bundle id):
  lo carga la plataforma, cifrado (`PUT /api/platform/tenants/:slug/push-credentials`).
- La firma (keystore de Android, certificados de Apple) es por marca y vive fuera del repo; con
  `publisher = client` la firma queda en la cuenta del cliente.
- El paso a paso de publicación está en [white-label.md](../white-label.md#checklist-de-publicación).

## Alternativas descartadas

- **Todo en la cuenta de Ventea:** el riesgo de 4.2.6 crece con cada marca y un rechazo de la
  cuenta afectaría a todas.
- **Todo en la cuenta del cliente:** frena la venta del plan Pro (el restaurante chico no tiene
  cuenta de developer y no sabe sacarla).
