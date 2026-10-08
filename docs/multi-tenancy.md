# Multi-tenancy

Un tenant es una marca que compró el SaaS. Carolina Hot Chicken es `carolina-hot-chicken`,
el tenant #1. La plataforma corre **una sola base de datos** y separa los datos por la
columna `tenantId`.

## Por qué `tenantId` y no una base por cliente

| Estrategia          | Aislamiento              | Costo operativo                 | Elegida |
| ------------------- | ------------------------ | ------------------------------- | ------- |
| `tenantId` por fila | Lógico, en la aplicación | Una DB, una migración           | **Sí**  |
| Schema por tenant   | Fuerte en Postgres       | Migración por schema, N schemas | No      |
| DB por tenant       | Total                    | Infra y costo por cliente       | No      |

Con `tenantId`: una migración corre una vez para todos, el costo por cliente nuevo es
cero, y agregar un tenant es un `INSERT`. El precio es que el aislamiento depende del
código, no del motor — de ahí las tres capas de abajo.

Cuándo reconsiderar: si un cliente exige aislamiento físico por contrato, o si un solo
tenant genera volumen que degrada a los demás.

## Las tres capas de aislamiento

### 1. Resolución del tenant — `apps/api/src/modules/tenants/tenant.middleware.ts`

Corre antes que cualquier controlador y resuelve el tenant en este orden:

1. **Subdominio** — `carolina-hot-chicken.ventea.tech` (web pública, panel admin)
2. **Header `X-Tenant-Slug`** — apps nativas, que no tienen host propio
3. **`DEFAULT_TENANT_SLUG`** — **solo** fuera de producción

El slug **nunca** sale del body ni de un query param. Son campos que el cliente controla
en cada request: aceptarlos ahí es dejar que cualquiera pida los datos de otra marca
cambiando un parámetro.

Un tenant inexistente y uno suspendido devuelven el mismo 404. Distinguirlos permitiría
enumerar qué marcas usan la plataforma.

### 2. Filtro explícito en cada servicio

Los servicios reciben `tenantId` vía `@CurrentTenant()` y lo ponen en el `where`. Esta
es la capa que de verdad aísla; las otras dos son verificación.

```ts
// Bien
this.prisma.order.findMany({ where: { tenantId, status: 'confirmed' } });

// Mal — devuelve pedidos de todas las marcas
this.prisma.order.findMany({ where: { status: 'confirmed' } });
```

### 3. Guard en Prisma — `apps/api/src/prisma/prisma.client.ts`

Una extensión de cliente (`$extends`) intercepta cada consulta de negocio y verifica que
el `where` incluya `tenantId`. En desarrollo lanza una excepción; en producción registra
el incidente sin tumbar el request.

Es una extensión y no el viejo `$use`: Prisma 7 eliminó los middleware. Como `$extends`
devuelve un objeto nuevo en vez de mutar el cliente, el cliente se provee por fábrica
bajo el token `PRISMA` — una clase que heredara de `PrismaClient` no podría llevar la
extensión consigo.

Es una **red de seguridad, no el mecanismo**. Detecta el olvido, no lo corrige: no puede
adivinar de qué tenant es una consulta que no lo dice.

Modelos exentos, y por qué:

- `PlatformAdmin`, `Tenant` — viven por encima de los tenants
- `MenuItemModifierGroup` — tabla puente pura; ambos extremos ya están acotados

## Índices únicos

Todo unique de negocio incluye `tenantId`:

```prisma
@@unique([tenantId, email])   // Customer, StaffMember
@@unique([tenantId, code])    // Order
```

Un `email @unique` global rompería dos cosas a la vez: la misma persona no podría tener
cuenta en dos marcas, y un `findUnique({ where: { email } })` cruzaría tenants sin que
nada avise. Lo mismo con el código de pedido: dos marcas pueden tener el pedido `A-042`
el mismo día y son pedidos distintos.

## Índices de consulta

Los índices arrancan con `tenantId` porque toda consulta filtra por él primero:

```prisma
@@index([tenantId, status])
@@index([tenantId, customerId, placedAt])
```

Un índice que no empiece por `tenantId` no sirve para estas consultas: Postgres tendría
que escanear las filas de todas las marcas antes de descartar.

## Tests de aislamiento

Todo módulo nuevo lleva un test que crea datos en dos tenants y verifica que las
consultas del tenant A no ven nada del tenant B. Por eso la semilla crea `demo-burgers`
además de Carolina: sin un segundo tenant, el test no puede fallar aunque el bug exista.

## Camino a RLS

Antes de tener varios tenants con datos reales, mover el aislamiento a **Row Level
Security** de Postgres:

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en toda tabla con `tenantId`
2. Política `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
3. `SET LOCAL app.tenant_id` al inicio de cada transacción, desde el middleware
4. Conectar con un rol **sin** `BYPASSRLS` (el owner de las tablas lo tiene por defecto)

Con RLS, un `where` olvidado devuelve cero filas en vez de las de otra marca: el motor
deja de confiar en que la aplicación se acuerde. El guard de Prisma queda como aviso
temprano en desarrollo.
