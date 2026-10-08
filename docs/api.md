# API

Todas las rutas van bajo `/api` y pasan por `TenantMiddleware`: la marca sale del subdominio
(`<slug>.ventea.tech`) o del header `X-Tenant-Slug`, que es lo que usan las apps nativas.
Las excepciones son `/api/health` y `/api/platform/*` (ver [Plataforma](#plataforma-saas)).

**Marca suspendida → `402 {statusCode: 402, message: "Servicio suspendido", error: "Payment Required"}`**
en toda ruta de la marca salvo:

- `/api/staff/*`, `/api/tenant` y `/api/auth/refresh`: el dueño sigue entrando al panel a pagar;
- `GET /api/orders`, `GET /api/orders/:id` y `GET /api/me`: el cliente sigue viendo su cuenta y
  sus pedidos en curso. Crear o cancelar pedidos, el menú, registro y login dan 402.

Pasa con la suscripción `suspended`, `canceled`, `past_due` o en prueba vencida. Una prueba
vencida pasa a `past_due` con el primer request de la marca, también en las rutas abiertas. Los schemas de entrada y salida son los de `@ventea/shared`
(`packages/shared/src/contracts`): la API valida con ellos y las apps los usan como tipos.

## Autenticación

JWT HS256 firmado con `JWT_SECRET`. Cada token lleva:

- `tid`: la marca. Un token de una marca no sirve en otra.
- `typ`: `access` (15 min) o `refresh` (30 días).
- `kind`: `customer`, `staff` o `platform`. El de plataforma no lleva `tid` ni refresh (dura
  1 h): no abre rutas de marca, y los tokens de marca no abren las de plataforma (401).

| Método      | Ruta                    | Quién                                                            |
| ----------- | ----------------------- | ---------------------------------------------------------------- |
| POST        | `/api/auth/register`    | público · acredita el bono de bienvenida                         |
| POST        | `/api/auth/login`       | público · el mismo 401 para email inexistente y clave incorrecta |
| POST        | `/api/auth/refresh`     | público · `{refreshToken}`, sirve para clientes y staff          |
| GET · PATCH | `/api/me`               | cliente                                                          |
| POST        | `/api/staff/auth/login` | público                                                          |

No hay revocación del lado del servidor: cerrar sesión es descartar los tokens. Ver
`.agent/decisions.md`.

## Catálogo (público)

| Método | Ruta                    |                                                                    |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/api/tenant`           | nombre, moneda, branding y programa de puntos                      |
| GET    | `/api/locations`        | sucursales activas                                                 |
| GET    | `/api/menu?locationId=` | menú publicado. Incluye los ítems agotados con `isAvailable=false` |

## Pedidos

| Método | Ruta                               | Quién                                                        |
| ------ | ---------------------------------- | ------------------------------------------------------------ |
| POST   | `/api/orders`                      | cliente                                                      |
| GET    | `/api/orders` · `/api/orders/:id`  | cliente · solo los propios                                   |
| POST   | `/api/orders/:id/cancel`           | cliente · solo en `confirmed`                                |
| GET    | `/api/staff/orders?status=&since=` | staff                                                        |
| PATCH  | `/api/staff/orders/:id/status`     | staff · `confirmed→preparing→ready→completed`, o `cancelled` |

- **Pedidos de staff:** `GET /api/staff/orders` y `PATCH …/status` devuelven `staffOrderSchema`:
  el pedido más `customer: {firstName, lastName, phone} | null` (null si la cuenta se borró) y
  `customerNotes`. La app del cliente sigue recibiendo `orderSchema`, sin esos campos.
  `since` (ISO 8601, opcional) deja solo los pedidos hechos desde ese instante; el panel lo
  usa con la medianoche local para el historial del día. Una fecha inválida da 400.
- **El cliente nunca manda precios.** La API recalcula cada línea desde el catálogo:
  `(base + deltas de las opciones) × cantidad`. También valida los mínimos y máximos de
  cada grupo de modificadores y la disponibilidad.
- **Estado inicial y pago:** el pedido nace `confirmed` con pago `pending`, porque se paga al
  retirar. Pasa a `paid` al completarse.
- **Solo `pickup` y `dine_in`:** `delivery` responde 400 porque no hay direcciones.

### Reintentos seguros: `Idempotency-Key`

`POST /api/orders` acepta el header opcional `Idempotency-Key`: de 8 a 128 caracteres
`[A-Za-z0-9_-]` (un UUID sirve). La app genera una clave por intento de compra y la repite
en cada reintento de ese mismo pedido. Así, si se pierde la respuesta, reintentar no crea un
segundo pedido ni debita los puntos dos veces.

| Caso                                   | Respuesta                                                 |
| -------------------------------------- | --------------------------------------------------------- |
| Clave nueva                            | `201` con el pedido creado                                |
| Misma clave y mismo cuerpo (reintento) | `200` con el pedido original, en su estado actual         |
| Misma clave y otro cuerpo              | `409 "Idempotency-Key reutilizada con otro pedido"`       |
| Clave con formato inválido             | `400`                                                     |
| Sin header                             | `201`: cada POST crea un pedido (comportamiento anterior) |

- La clave es **por cliente**: la misma clave usada por otro cliente u otra marca no choca.
- "Mismo cuerpo" se compara después de validar: un orden distinto de los campos, de las
  opciones de una línea, o campos que la API ignora no cuentan como cambio. Un cambio en las líneas, opciones, cantidades, sucursal,
  canje o notas, sí.
- Un reintento devuelve el pedido original aunque el menú haya cambiado desde entonces.
- Requests concurrentes con la misma clave dejan un solo pedido: los demás reciben `200` con él.
- CORS: la API refleja los headers pedidos en el preflight, así que `Idempotency-Key` está
  permitido desde los orígenes habilitados.

## Puntos

| Método | Ruta                   |                                      |
| ------ | ---------------------- | ------------------------------------ |
| GET    | `/api/rewards/balance` | saldo y total ganado                 |
| GET    | `/api/rewards/ledger`  | movimientos, el más reciente primero |

Los puntos son un libro contable: cada movimiento es un asiento y el saldo es su suma.

- **Canje:** se debita al crear el pedido, en la misma transacción y con la fila del cliente
  bloqueada, así que dos pedidos simultáneos no pueden dejar el saldo negativo.
- **Acreditación:** al pasar a `completed`, una sola vez por pedido.
- **Cancelación:** devuelve lo canjeado.

Valores por defecto del programa (`DEFAULT_REWARD_PROGRAM`), en unidades menores:

- 1 punto por unidad de moneda gastada;
- 1 punto = 1 centavo al canjear;
- canje desde 100 puntos;
- bono de bienvenida de 50 puntos.

## Plataforma (SaaS)

Rutas sin tenant (fuera de `TenantMiddleware` y del 402). Contratos en
`packages/shared/src/contracts/platform.ts`.

| Método | Ruta                                       | Quién                                                      |
| ------ | ------------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/platform/plans`                      | público · planes activos (precios en centavos USD)         |
| GET    | `/api/platform/slug-available?slug=`       | público · `{available, reason?: invalid·reserved·taken}`   |
| POST   | `/api/platform/signup`                     | público · 5 intentos por IP y hora (`429` + `Retry-After`) |
| POST   | `/api/platform/auth/login`                 | público · `PlatformAdmin`; 20 intentos por IP y hora       |
| GET    | `/api/platform/tenants?page=&pageSize=`    | plataforma · `{items, total, page, pageSize}` (máx 100)    |
| GET    | `/api/platform/tenants/:slug`              | plataforma · + sucursales activas y últimos 20 eventos     |
| POST   | `/api/platform/tenants/:slug/suspend`      | plataforma · `{reason?}`                                   |
| POST   | `/api/platform/tenants/:slug/reactivate`   | plataforma · abre un período nuevo desde hoy               |
| POST   | `/api/platform/tenants/:slug/change-plan`  | plataforma · `{planCode, interval?}`                       |
| POST   | `/api/platform/tenants/:slug/extend-trial` | plataforma · `{days}` (1–90)                               |

- **Registro:** `{restaurantName, slug, ownerName, ownerEmail, ownerPassword (≥ 10), planCode,
interval, country?, currency?}`. Crea en una transacción la marca, su branding, el programa
  de puntos por defecto, «Sucursal principal», el dueño con esa contraseña y la suscripción en
  prueba de 14 días. Responde `201 {tenant: {slug, url, adminUrl, region}, trialEndsAt}`. Slug
  tomado → `409`; reservado o inválido → `400`. El campo oculto `website` (honeypot) tiene que
  venir vacío. Cupo global contado en la base: `SIGNUP_DAILY_LIMIT` (10) y
  `SIGNUP_WEEKLY_LIMIT` (25) altas por registro; lleno → `429 "Registro temporalmente
cerrado, escríbenos"`. Slugs reservados: infraestructura, suplantación (`login`, `pagos`…),
  todo lo que empiece con `admin` y todo lo que contenga `ventea`.
- **Clientes:** la landing (`apps/landing`, `https://ventea.tech`) usa `plans`,
  `slug-available` y `signup`; el panel de plataforma (`apps/admin`,
  `https://ventea.tech/admin/plataforma`) el login y `tenants/*`. Los dos llaman a `/api` del
  mismo origen (Traefik manda `ventea.tech/api/*` a la API). En producción el CORS acepta
  además el apex `https://<TENANT_BASE_DOMAIN>` y un nivel de subdominio
  (`src/cors-origins.ts`), por si la landing se sirve aparte y llama a `api.ventea.tech`.
- **Token de plataforma:** lleva `ver` (`PlatformAdmin.tokenVersion`); resetear la clave lo sube
  y todos los tokens vivos dejan de valer.
- **Región:** la asigna `REGIONS` por país: el del body, si no `CF-IPCountry` / `X-Country`.
- **Transiciones:** suspender desde `trialing`/`active`/`past_due`; reactivar desde
  `suspended`/`past_due`/`canceled`; extender la prueba desde `trialing`/`past_due`; cambiar de
  plan salvo `canceled`, y nunca a uno donde no quepan las sucursales activas. Fuera de eso,
  `409`. Cada cambio deja un `BillingEvent`.

## Scripts de operación

```bash
# Alta de marca (dueño con contraseña aleatoria, se muestra una vez). Suscripción active,
# plan Cadena anual salvo --plan basic|pro|chain --interval month|year
node apps/api/dist/scripts/create-tenant.js --slug <slug> --name "<nombre>" --owner-email <email>

# Admin de la plataforma (contraseña aleatoria, se muestra una vez; --reset-password genera otra)
node apps/api/dist/scripts/create-platform-admin.js --email <email> --name "<nombre>"

# Reemplazar el menú de una marca desde un JSON. Corre en una transacción; los
# pedidos existentes no se tocan. Cambiar la moneda de una marca que ya tiene
# pedidos exige --force-currency.
node apps/api/dist/scripts/import-menu.js --tenant <slug> --file apps/api/prisma/data/carolina-menu.json
```
