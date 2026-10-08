# 0006 — Una instancia por cliente, en su VPS

**Estado**: reemplazada por [0007](0007-saas-multi-tenant.md) · 2026-10-08 (aceptada 2026-08-31)
**Modifica el alcance de**: [0002](0002-multi-tenancy-tenant-id.md)

## Contexto

El ADR 0002 asumió, sin decirlo, que Ventea correría como una nube central: una
instancia nuestra atendiendo a todas las marcas, separadas por `tenantId`.

El modelo comercial es otro. Cada cliente aloja su propia instancia en su VPS o su
hosting: nosotros vendemos y desplegamos el software, no operamos la infraestructura.

## Decisión

Un despliegue completo por cliente —Postgres, API, front y proxy con TLS— definido en
`deploy/docker-compose.prod.yml`. Un cliente = un VPS = un dominio = un `.env`.

`TenantMiddleware` gana un modo de operación:

- `TENANT_MODE=single` (producción): el slug se fija en `TENANT_SLUG` y no se lee de la
  petición.
- `TENANT_MODE=multi` (desarrollo, y hosting compartido si algún día conviene): el
  tenant sale del subdominio o del header `X-Tenant-Slug`.

**`tenantId` se mantiene en todas las tablas**, aunque la instancia atienda una sola marca.

## Por qué no se quita `tenantId`

Con una instancia por cliente, la columna parece redundante: la base entera es de un
solo tenant. Quitarla ahorraría una columna por tabla y un filtro por consulta.

No se quita, por tres razones concretas:

1. **Un cliente puede tener más de una marca.** Un grupo gastronómico con dos locales de
   marcas distintas es un cliente, no dos VPS.
2. **Clientes chicos en hosting compartido.** No todos van a pagar un VPS. Sin
   `tenantId`, ese segmento exige una segunda versión del producto.
3. **Reintroducirlo después es una migración de datos en producción**, en N instancias
   distintas y con las apps de los clientes en la calle. Mantenerlo cuesta una columna;
   agregarlo tarde cuesta un proyecto.

El guard de Prisma sigue vigente por el mismo motivo: es lo que garantiza que el código
siga siendo correcto en modo `multi`.

## Alternativas descartadas

- **Nube central multi-tenant**: más simple de operar y actualizar, pero no es lo que se
  vende. Además obliga a responder por la disponibilidad y los datos de todos los
  clientes a la vez.
- **Instalador sin contenedores**: menos requisitos para el VPS, pero cada cliente
  terminaría con una versión distinta de Node, de Postgres y de las dependencias del
  sistema. El primer problema raro se vuelve imposible de reproducir.

## Consecuencias

- Actualizar es N despliegues. Con cinco clientes es un rato; con treinta hace falta
  automatizarlo o el parche de seguridad no llega a todos.
- Las versiones divergen entre clientes. Hace falta registro de qué corre cada uno.
- Sin acceso a los logs salvo que el cliente lo dé: hay que definir qué se registra y
  cómo se pide antes de necesitarlo con el sitio caído.
- El respaldo vive en el mismo VPS que la base — donde no sirve si el VPS se pierde.
  Copiarlo afuera es parte de la puesta en marcha.
- A favor: los datos quedan en la infraestructura del cliente, sin costo de
  infraestructura por cliente para nosotros y sin una caída que afecte a todos a la vez.
