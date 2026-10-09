# API

Todas las rutas van bajo `/api` y pasan por `TenantMiddleware`: la marca sale del subdominio
(`<slug>.ventea.tech`) o del header `X-Tenant-Slug`, que es lo que usan las apps nativas.
Las excepciones son `/api/health`, `/api/platform/*` (ver [Plataforma](#plataforma-saas)) y
`GET /api/media/*` (archivos públicos de imágenes, ver [Medios](#medios-imágenes-de-la-marca)).

**Marca suspendida → `402 {statusCode: 402, message: "Servicio suspendido", error: "Payment Required"}`**
en toda ruta de la marca salvo:

- `/api/staff/*`, `/api/tenant`, `/api/auth/refresh` y `/api/billing/*`: el dueño sigue
  entrando al panel a pagar;
- `GET /api/orders`, `GET /api/orders/:id` y `GET /api/me`: el cliente sigue viendo su cuenta y
  sus pedidos en curso, y `DELETE /api/devices/:id` (baja del push al cerrar sesión). Crear o
  cancelar pedidos, el menú, registro y login dan 402.

Pasa con la suscripción `suspended`, `canceled` o en prueba vencida. Una prueba vencida pasa a
`past_due` con el primer request de la marca, también en las rutas abiertas, y sigue en 402.
**Gracia (TASK-007):** un `past_due` de un período pagado que venció sin pago **sigue
atendiendo** (menú, pedidos, todo) hasta `currentPeriodEnd + 7 días` (`graceEndsAt` en
`GET /api/billing`); pasado eso, 402 aunque el ciclo todavía no la haya pasado a `suspended`. Los schemas de entrada y salida son los de `@ventea/shared`
(`packages/shared/src/contracts`): la API valida con ellos y las apps los usan como tipos.

**Códigos estables de error (TASK-017):** el cuerpo de error es `{statusCode, message, error}`;
los límites del plan agregan `code: "plan_limit"` y `limit: {resource: locations · branded_app · staff,
plan (código), planName, max}` (`max: null` = el plan no lo incluye). `message` sigue en español; los clientes
traducen por `code` (`packages/shared/src/contracts/errors.ts`). Hoy: alta de sucursal y cambio de
plan con sucursales de más (`locations`, 403/409) y solicitud de app propia (`branded_app`, 403), invitar o reactivar
usuarios del panel con el cupo lleno (`staff`, 403; TASK-022).

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

- **`/api/tenant` → `branding`** (TASK-016): `primaryColor`, `secondaryColor`, `accentColor`
  (null si no hay), `appDisplayName`, `logoUrl` e `iconUrl`. Las URLs de imágenes subidas a
  Ventea salen **absolutas** (`https://<host del request>/api/media/<tenantId>/<hash>.webp`, o
  `MEDIA_PUBLIC_BASE_URL` si está definida): sirven igual en el web, la app nativa y el generador
  de apps. El host del request se usa solo si es de la plataforma (`TENANT_BASE_DOMAIN` y sus
  subdominios, o el de `PUBLIC_ORIGIN`); con otro Host las URLs salen **relativas**
  (`/api/media/…`). Una URL heredada de antes de TASK-016 sale tal cual.
- **`/api/menu`** no muestra ítems ni categorías borrados desde el panel; `imageUrl` absoluta como
  arriba.

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

## Cobro de la suscripción (`/api/billing`)

Solo staff con rol `owner` (manager y staff → `403`). Abiertas aunque la marca esté suspendida.
Contratos en `packages/shared/src/contracts/billing.ts`. Montos en centavos USD.

| Método | Ruta                          | Qué hace                                                                                          |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/api/billing`                | plan, precio, estado, fechas, `graceEndsAt`, tarjeta (marca, últimos 4), modo, últimos 20 eventos |
| POST   | `/api/billing/payment-method` | alta o cambio de tarjeta + primer cobro (`establish`)                                             |
| POST   | `/api/billing/change-plan`    | `{planCode, interval?}`: se aplica al **próximo período**, sin prorrateo                          |
| POST   | `/api/billing/cancel`         | cancela al terminar el período (o la prueba)                                                      |
| POST   | `/api/billing/resume`         | anula la cancelación agendada                                                                     |

- **Alta de tarjeta:** `{card: {number, expiryMonth, expiryYear, cvv, holder}, billing: {country,
city?, line1?, state?, zip?, phone?, email?}}`. Tokeniza y cobra el próximo período con CVV
  (`storedCredential.usage = "establish"`). El período pagado empieza al terminar la prueba (en
  `trialing`), al terminar el período vigente (pago adelantado, en cualquier estado) o ahora
  (período vencido), y aplica el cambio de plan agendado; reactiva una cancelación agendada.
  Respuestas: `200` con el estado nuevo · `402` tarjeta rechazada (la suscripción no cambia) ·
  `400` datos inválidos (Luhn, vencida, o rechazados por la pasarela antes del banco) · `503`
  pasarela no disponible, o alta con número crudo deshabilitada en producción (ver
  `ALLOW_RAW_CARD_API` en deployment.md) · `504` el banco no confirmó (incluye los 5xx del
  procesador): **no reintentar**, lo revisa la plataforma · `409` hay un cobro en curso o sin
  confirmar, o modo `manual` · `429` más de 5 intentos por marca y hora
  (`BILLING_RATE_LIMIT_PER_HOUR`), más de 10 por IP y día entre todas las marcas
  (`BILLING_IP_RATE_LIMIT_PER_DAY`), o 3 tarjetas rechazadas seguidas (bloqueo de 24 h con
  alerta `billing_alert`).
- **Eventos que ve el dueño:** solo los tipos de la lista blanca `OWNER_BILLING_EVENT_TYPE`
  (`packages/shared/src/domain/enums.ts`), con `{type, description, amountCents, status,
createdAt}`. `description` la genera la API desde el tipo («Pago registrado», «Cobro
  rechazado por el banco»…); el `message` interno (email del admin, referencia, notas,
  orderId) nunca sale. `billing_alert`, `payment_unknown` y cualquier tipo nuevo quedan solo
  para la plataforma.
- **El número y el CVV nunca se guardan, ni se loguean, ni vuelven en una respuesta.** Se
  guarda el token de la pasarela, el `networkTransactionId` del primer cobro, marca, últimos 4
  y vencimiento. El logger de la API tacha PAN y CVV como red de seguridad.
- **change-plan:** `409` si la marca tiene más sucursales activas de las que permite el plan
  destino. Pedir el plan actual anula el cambio agendado.
- **Con un cobro en curso o sin confirmar** (`payment_attempts` `pending`/`unknown`),
  `payment-method`, `change-plan`, `cancel` y `resume` responden `409` hasta que se resuelva:
  nada puede cambiar lo que se está cobrando.

## Cobro recurrente

`BillingCycleService` corre cada 15 min (`BILLING_CYCLE_INTERVAL_MINUTES`) con un
`pg_try_advisory_lock`: aunque haya varias réplicas, cobra una sola. También a mano con
`node apps/api/dist/scripts/run-billing-cycle.js`.

Invariantes de dinero:

- **Un solo intento abierto por suscripción** (`pending`, `unknown` o `needs_review`), de
  cualquier tipo (alta o renovación). Mientras exista no se cobra nada más, ni la suscripción
  cambia de estado sola: no vence ni se suspende, tampoco por el tráfico (una prueba vencida
  con un alta sin confirmar sigue atendiendo). `reactivate` del admin da `409`.
- **La suspensión del admin gana**: si después se confirma un cobro, se aplica al período pero
  la marca sigue `suspended`, con alerta. `reactivate` conserva un período ya pagado.
- **Lo cobrado queda congelado en el intento** (plan, intervalo, inicio y fin del período,
  monto). El resultado se aplica con esos datos, nunca con el estado actual.
- **Un período pagado se aplica solo si no estaba cubierto** (`currentPeriodEnd <=` inicio del
  período pagado). Si ya lo estaba, el cobro se asienta, el período no se mueve y queda una
  alerta `billing_alert` de posible doble pago.
- **Un aprobado se verifica**: monto, moneda y `orderId` iguales a lo pedido y sin
  autorización parcial; si no, queda `needs_review` con una sola alerta y no se concilia solo
  (un `status` posterior no trae el monto): lo cierra `resolve-payment`.

1. **Conciliación:** los intentos de renovación sin confirmar (`unknown`, o `pending` de un
   proceso que murió) se consultan con `status`; nunca se recobran a ciegas. Uno sin
   `transactionId` (timeout antes de la respuesta) no se puede consultar en ms-payments: queda
   para `resolve-payment`. Los de alta de tarjeta también.
2. **Cancelación:** las que pidieron cancelar pasan a `canceled` al vencer.
3. **Renovación** (`BILLING_MODE=ms-payments`): `active`/`past_due` vencidas, con tarjeta y sin
   cancelar. Cobro sin CVV (`usage = "recurring"`, `initialTransactionId` = el del primer
   cobro, siempre). `orderId` = `sub-<subId>-<AAAAMMDD del inicio del período>-a<n>`, escrito en
   `payment_attempts` **antes** de llamar a la pasarela. Aprobado → período siguiente (fin de
   mes con clamp) con el plan cobrado. Rechazo del banco → `past_due` y reintentos a los días
   1, 3 y 7 del vencimiento (como mínimo 20 h entre cobros si el ciclo estuvo parado); el 4.º
   rechazo → `suspended`. Timeout, 5xx o respuesta ilegible → `unknown` (se concilia); tres
   seguidos cortan las renovaciones de esa corrida (circuit breaker). Un 400 de la pasarela
   (no llegó al banco) → intento `failed_non_bank`: no cuenta para el dunning, reintento en
   24 h y visible en `unresolvedPayments`. Al 3.º del mismo período → `past_due` +
   `billing_alert`, y desde ahí sigue el dunning normal.
4. **Vencimientos sin cobro:** prueba vencida → `past_due`; `active` vencida sin tarjeta (o en
   modo `manual`) → `past_due`; `past_due` sin tarjeta (o manual) 7 días después del
   vencimiento → `suspended`.

Cada paso deja su `BillingEvent` (`payment_succeeded`, `payment_failed`, `payment_unknown`,
`past_due`, `suspended`, `canceled`…) y avisa por `BillingNotifier` (hoy, log; el email se
enchufa ahí).

## Menú desde el panel (`/api/staff/menu`, TASK-016)

Lee cualquier staff de la marca; escriben **owner y manager** (staff → `403`). Contratos en
`packages/shared/src/contracts/menu-admin.ts`. Bodies estrictos (campo desconocido → `400`),
centavos enteros ≥ 0 (las opciones pueden ser negativas), nombres requeridos.

| Método | Ruta                                                  |                                                                                                                                          |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/staff/menu`                                     | árbol completo con inactivos y agotados (sin borrados) + grupos                                                                          |
| GET    | `/api/staff/menu/changes?limit=`                      | auditoría (`MenuChange`: quién, entidad, acción, cambios, cuándo); owner · manager                                                       |
| POST   | `/api/staff/menu/categories`                          | `{name, isActive?}` → `201 {id}`                                                                                                         |
| PATCH  | `/api/staff/menu/categories/:id`                      | `{name?, isActive?}` → `204`                                                                                                             |
| DELETE | `/api/staff/menu/categories/:id`                      | `409` si tiene productos; `204`                                                                                                          |
| PATCH  | `/api/staff/menu/categories/reorder`                  | `{items: [{id, sortOrder}]}` → `204`                                                                                                     |
| POST   | `/api/staff/menu/items`                               | `{categoryId, name, basePriceCents, description?, compareAtPriceCents?, tags?, isAvailable?, imageUrl?, modifierGroupIds?}` → `201 {id}` |
| PATCH  | `/api/staff/menu/items/:id`                           | parcial; `modifierGroupIds` reemplaza la lista; `imageUrl: null` quita la foto                                                           |
| PATCH  | `/api/staff/menu/items/:id/availability`              | `{isAvailable}` (toggle rápido)                                                                                                          |
| DELETE | `/api/staff/menu/items/:id`                           | `{deleted: "hard"}`, o `{deleted: "soft"}` si tiene pedidos                                                                              |
| PATCH  | `/api/staff/menu/items/reorder`                       | `{items: [{id, sortOrder}]}`                                                                                                             |
| POST   | `/api/staff/menu/modifier-groups`                     | `{name, minSelect, maxSelect, options?: [{name, priceDeltaCents, isAvailable}]}`                                                         |
| PATCH  | `/api/staff/menu/modifier-groups/:id`                 | `{name?, minSelect?, maxSelect?}` (min ≤ max contra lo guardado)                                                                         |
| DELETE | `/api/staff/menu/modifier-groups/:id`                 | borra sus opciones y su uso en los ítems                                                                                                 |
| POST   | `/api/staff/menu/modifier-groups/:id/options`         | `{name, priceDeltaCents?, isAvailable?}`                                                                                                 |
| PATCH  | `/api/staff/menu/modifier-groups/:id/options/reorder` | `{items: [{id, sortOrder}]}` (solo opciones del grupo)                                                                                   |
| PATCH  | `/api/staff/menu/modifier-options/:id`                | `{name?, priceDeltaCents?, isAvailable?}`                                                                                                |
| DELETE | `/api/staff/menu/modifier-options/:id`                | `204`                                                                                                                                    |

- **Referencias del body** (categoría, grupos, `imageUrl`) se verifican contra la marca: de otra
  marca o inexistentes → `400`. Ids de la ruta de otra marca → `404`.
- **`compareAtPriceCents`** (precio tachado) tiene que ser mayor que `basePriceCents`.
- **Borrado:** un ítem con pedidos se marca `deletedAt` (sale del menú y del panel, y no se puede
  pedir; los pedidos guardan snapshot). Sin pedidos se borra de verdad. Una categoría que solo
  conserva ítems borrados se marca borrada (la FK desde el ítem es `Restrict`).
- **Auditoría:** cada escritura deja su `MenuChange` en la misma transacción.

## Medios (imágenes de la marca)

| Método | Ruta                                        | Quién                                                          |
| ------ | ------------------------------------------- | -------------------------------------------------------------- |
| POST   | `/api/staff/media`                          | owner · manager · `multipart/form-data`, campo `file`          |
| GET    | `/api/staff/media`                          | owner · manager · `{items, usedBytes, quotaBytes}`             |
| DELETE | `/api/staff/media/:hash`                    | owner · manager · `409` si un ítem o la marca la usan          |
| GET    | `/api/media/<tenantId>/<hash>[.thumb].webp` | público · `Cache-Control: public, max-age=31536000, immutable` |

- **Subida:** solo PNG, JPEG o WebP, ≤ 5 MB (multer corta el stream: `413`), un único campo.
  El tipo se verifica por magic number y por lo que lee sharp, no por el `Content-Type`: otro →
  `415`. Se re-codifica a **WebP ≤ 1600 px** de ancho + miniatura de **400 px**, con la
  orientación aplicada y **sin EXIF/GPS** ni bytes extra (un polyglot sale limpio). El nombre es
  el sha256 del WebP: la misma imagen no ocupa dos veces. Respuesta `201 {url, thumbUrl, width,
height}` con URLs absolutas.
- **Límites por marca:** cuota `MEDIA_QUOTA_MB` (200) → `403` con el motivo; 60 subidas por hora
  (`MEDIA_UPLOAD_RATE_LIMIT_PER_HOUR`) → `429` + `Retry-After`.
- **Límites por imagen y por servidor:** más de **24 MP** (se mira la cabecera antes de
  decodificar) → `413`. sharp procesa como mucho 2 imágenes a la vez por proceso
  (`MEDIA_PROCESSING_CONCURRENCY`); las demás esperan hasta 20 s (`MEDIA_PROCESSING_WAIT_MS`) y
  después, o con más de 20 en fila, → `503`.
- **Servido:** solo nombres con forma de hash bajo un tenantId con forma de UUID (traversal →
  `404`); `Content-Type: image/webp` fijo, `nosniff`, `Cross-Origin-Resource-Policy:
cross-origin` (la app nativa y el panel la cargan desde otro origen) y CSP `sandbox`.
- **Aislamiento:** un ítem o la marca solo pueden referenciar medios subidos por la misma marca
  (`400` si no). En la base se guarda la ruta `/api/media/…`, nunca el host.

## Mi marca y app propia (`/api/staff/brand`, TASK-016)

Solo el **dueño**. Contratos en `packages/shared/src/contracts/brand.ts`.

| Método | Ruta                           |                                                                                                                                                      |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/staff/brand`             | branding + `warnings` de contraste + estado de la app (solo lectura)                                                                                 |
| PATCH  | `/api/staff/brand`             | `{appDisplayName?, primaryColor?, secondaryColor?, accentColor?, logoUrl?, iconUrl?, storeShortDescription?, supportEmail?, websiteUrl?, language?}` |
| POST   | `/api/staff/brand/app-request` | pide la app nativa: `403` sin plan Pro/Cadena (con el motivo), `409` si ya la pidió                                                                  |

- **Colores** `#rrggbb` (se guardan en minúsculas). `warnings[]` (no bloquea): el texto blanco
  sobre el color no llega a 4.5:1; trae `whiteRatio`, `blackRatio` y `recommendedTextColor`.
- **Logo e ícono** tienen que ser medios propios. `websiteUrl` solo `https://`. `language`
  (`es` · `en`) decide el idioma de las notificaciones push. Body estricto: `bundleId` o el
  estado de la app → `400` (los maneja la plataforma).
- **Solicitud:** crea la `AppConfig` con `bundleId = app.ventea.<slug sin guiones>` y `publisher`
  por plan (Pro → `ventea`, Cadena → `client`, [ADR 0008](adr/0008-publicacion-apps-por-marca.md)),
  estado `requested` y un `AppConfigEvent`.

## Sucursales desde el panel (`/api/staff/locations`, TASK-022)

Lee cualquier staff; escriben owner y manager. Cada escritura con advisory lock por marca.

| Método | Ruta                       | Notas                                                                                                                                                |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/staff/locations`     | todas (con inactivas) + `hasOrders` + `usage {used, max, plan, planName}` (activas contra el plan)                                                   |
| POST   | `/api/staff/locations`     | `{name, address, phone?, openingHours?, isActive?, acceptsOrders?, latitude?, longitude?}` → `201`; activa sobre el tope del plan → `403 plan_limit` |
| PATCH  | `/api/staff/locations/:id` | parcial; reactivar sobre el tope → `403 plan_limit`; desactivar la última activa → `409`                                                             |
| DELETE | `/api/staff/locations/:id` | `204`; con pedidos o la última activa → `409`                                                                                                        |

`openingHours`: `[{day 0-6, opens "HH:MM", closes "HH:MM"}]`, ≤ 2 tramos por día; `closes < opens` = cierra
pasada la medianoche. `acceptsOrders: false` = la sucursal se lista en la app (`GET /api/locations` lo
expone) pero `POST /api/orders` responde `400`; `GET /api/menu` sin `locationId` prefiere una que acepte.

## Equipo (`/api/staff/team`, TASK-022)

Solo el dueño. Roles asignables `manager` · `staff`. Cupo del plan (`plans.maxStaff`: Básico 3, Pro 10,
Cadena sin límite) = miembros activos + invitaciones pendientes.

| Método | Ruta                                         | Notas                                                                                                        |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/staff/team`                            | `{members[] (con isSelf), invitations[] (pendientes), usage}`                                                |
| POST   | `/api/staff/team/invitations`                | `{email, role}` → `201 {invitation, token, expiresAt}`; ya es miembro → `409`; cupo lleno → `403`            |
| DELETE | `/api/staff/team/invitations/:id`            | revoca → `204`                                                                                               |
| PATCH  | `/api/staff/team/members/:id`                | `{role?, isActive?}` → `204`; a sí mismo o dejar la marca sin dueño activo → `409`; reactivar sin cupo `403` |
| POST   | `/api/staff/team/members/:id/password-reset` | `201 {token, expiresAt}`; a sí mismo o desactivado → `409`                                                   |

Públicos (quien recibe el enlace), token SIEMPRE en el cuerpo, rate limit por IP
(`TEAM_LINK_ATTEMPT_RATE_LIMIT_PER_HOUR`, 30); crear enlaces, por marca (`TEAM_LINK_RATE_LIMIT_PER_HOUR`, 30):

| Método | Ruta                                     | Notas                                                       |
| ------ | ---------------------------------------- | ----------------------------------------------------------- |
| POST   | `/api/staff/auth/invitation/lookup`      | `{token}` → `{email, role, brandName, expiresAt}`           |
| POST   | `/api/staff/auth/invitation/accept`      | `{token, name, password}` → sesión de staff (como el login) |
| POST   | `/api/staff/auth/password-reset/lookup`  | `{token}` → `{email, name, expiresAt}`                      |
| POST   | `/api/staff/auth/password-reset/confirm` | `{token, password}` → sesión de staff; corta las anteriores |

- **Tokens:** 32 bytes base64url, la base guarda su sha256; un solo uso, 72 h; uno nuevo revoca el
  anterior (mismo email / mismo miembro). Inválido, vencido, usado, revocado o de otra marca → el
  mismo `404`. El panel arma el enlace con el token en el fragmento (`/admin/join#…`,
  `/admin/reset-password#…`). Sin correo todavía: el dueño copia el enlace (`TeamService.deliver`,
  `TODO(TASK-021)`).
- **Sesiones:** el JWT de staff lleva `ver` (`StaffMember.tokenVersion`); el guard compara contra la
  base en cada request y toma el rol de la base. Cambio de rol, desactivación y contraseña nueva lo
  suben: las sesiones vivas del miembro mueren en el acto (`401`).

## Push (`/api/devices`, TASK-016)

| Método | Ruta               | Quién                                                                                                                   |
| ------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/devices`     | cliente · `{platform: android · ios · web, pushToken}` → `201 {id, platform, createdAt}`; `200` si el token ya era suyo |
| DELETE | `/api/devices/:id` | cliente · al cerrar sesión; `404` si no es suyo; `204`                                                                  |

- **Upsert por (marca, token):** si el token era de otro cliente de la marca (cambio de cuenta en
  el mismo teléfono), pasa al actual (`201`). Al cambiar de dueño se descarta el `biometricKeyId`. Máximo 10 dispositivos por cliente (los más viejos se borran) y 30 registros por cliente y hora (`DEVICE_REGISTER_RATE_LIMIT_PER_HOUR`, `429`).
- **Aviso de estado:** `PATCH /api/staff/orders/:id/status` a `preparing`, `ready`, `completed` o
  `cancelled` manda un push a los dispositivos del cliente **después** de responder y sin
  bloquear (un FCM caído no afecta el pedido). Payload FCM: `notification {title, body}`
  (título = `appDisplayName`, texto ES/EN según `language` de la marca) y `data {type:
"order_status", orderId, status, code}`; la app abre `/orders/:orderId`. La cancelación del
  propio cliente no le avisa. Sin credenciales FCM de la marca → no-op con log. Los tokens que FCM
  da por inválidos se borran del dispositivo.
- **FCM HTTP v1** con la service account de cada marca (ver Plataforma). **No verificado contra
  Firebase real**: los tests usan `FakePushTransport`. Cómo configurarlo:
  [white-label.md](white-label.md#push).

## Plataforma (SaaS)

Rutas sin tenant (fuera de `TenantMiddleware` y del 402). Contratos en
`packages/shared/src/contracts/platform.ts`.

| Método | Ruta                                           | Quién                                                                                                                                          |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/platform/plans`                          | público · planes activos (precios en centavos USD)                                                                                             |
| GET    | `/api/platform/slug-available?slug=`           | público · `{available, reason?: invalid·reserved·taken}`                                                                                       |
| POST   | `/api/platform/signup`                         | público · 5 intentos por IP y hora (`429` + `Retry-After`)                                                                                     |
| POST   | `/api/platform/auth/login`                     | público · `PlatformAdmin`; 20 intentos por IP y hora                                                                                           |
| GET    | `/api/platform/tenants?page=&pageSize=`        | plataforma · `{items, total, page, pageSize}` (máx 100)                                                                                        |
| GET    | `/api/platform/tenants/:slug`                  | plataforma · + sucursales activas y últimos 20 eventos                                                                                         |
| POST   | `/api/platform/tenants/:slug/suspend`          | plataforma · `{reason?}`                                                                                                                       |
| POST   | `/api/platform/tenants/:slug/reactivate`       | plataforma · abre un período desde hoy (conserva uno ya pagado); `409` con un cobro sin confirmar                                              |
| POST   | `/api/platform/tenants/:slug/change-plan`      | plataforma · `{planCode, interval?}`                                                                                                           |
| POST   | `/api/platform/tenants/:slug/extend-trial`     | plataforma · `{days}` (1–90)                                                                                                                   |
| POST   | `/api/platform/tenants/:slug/record-payment`   | plataforma · `{amountCents, reference}`: pago recibido por fuera; abre un período; `409` con un cobro sin confirmar                            |
| POST   | `/api/platform/tenants/:slug/resolve-payment`  | plataforma · `{orderId, outcome: succeeded·failed, note?}`: cierra un cobro sin confirmar                                                      |
| GET    | `/api/platform/billing/summary`                | plataforma · `{currency, mrrCents, byStatus, failuresLast7Days, unresolvedPayments, alertsLast7Days}`                                          |
| GET    | `/api/platform/tenant-ready?slug=`             | público · `{ready}`: ¿`https://<slug>.<dominio>` ya responde con HTTPS válido? `404` si no existe; 240/IP/h                                    |
| POST   | `/api/platform/analytics/event`                | público · `{event}` del embudo → `204`; sin cookies ni PII; 120/IP/h (`ANALYTICS_RATE_LIMIT_PER_HOUR`)                                         |
| GET    | `/api/platform/analytics/funnel?days=`         | plataforma · `{timezone, days: [{day, counts}], totals}` (1–90 días, default 30, más nuevo primero)                                            |
| GET    | `/api/platform/app-requests?status=`           | plataforma · cola de apps (TASK-016): sin `status`, todo lo `requested` · `building` · `in_review`                                             |
| GET    | `/api/platform/tenants/:slug/app`              | plataforma · `AppConfig` (o los valores por defecto, `exists: false`), `push {configured}` y últimos 20 eventos                                |
| PATCH  | `/api/platform/tenants/:slug/app`              | plataforma · `{bundleId?, publisher?, status?, version? (X.Y.Z), buildNumber?, storeUrls? {android?, ios?}}`; `bundleId` de otra marca → `409` |
| GET    | `/api/platform/tenants/:slug/app/build-config` | plataforma · para el generador (TASK-019): marca, branding con URLs absolutas, `AppConfig`, `apiBaseUrl`, `push {configured}`                  |
| PUT    | `/api/platform/tenants/:slug/push-credentials` | plataforma · JSON de la service account de Firebase; se guarda cifrado; responde `{configured, projectId, updatedAt}`                          |
| DELETE | `/api/platform/tenants/:slug/push-credentials` | plataforma · las borra                                                                                                                         |

- **Registro:** `{restaurantName, slug, ownerName, ownerEmail, ownerPassword (≥ 10), planCode,
interval, acceptedTermsVersion, country?, currency?}`. `acceptedTermsVersion` (TASK-007) es
  obligatorio y tiene que ser una de `TERMS_VERSIONS` (`@ventea/shared`); se guarda en
  `tenants.termsVersion` con la fecha en `termsAcceptedAt`. Sin él → `400`. Crea en una transacción la marca, su branding, el programa
  de puntos por defecto, «Sucursal principal», el dueño con esa contraseña y la suscripción en
  prueba de 14 días. Responde `201 {tenant: {slug, url, adminUrl, region}, trialEndsAt}`. Slug
  tomado → `409`; reservado o inválido → `400`. El campo oculto `website` (honeypot) tiene que
  venir vacío. Cupo global contado en la base: `SIGNUP_DAILY_LIMIT` (10) y
  `SIGNUP_WEEKLY_LIMIT` (25) altas por registro; lleno → `429 "Registro temporalmente
cerrado, escríbenos"`. Slugs reservados: infraestructura, suplantación (`login`, `pagos`…),
  todo lo que empiece con `admin` y todo lo que contenga `ventea`.
- **Clientes:** la landing (`apps/landing`, `https://app.ventea.tech`; el apex y `www`
  redirigen ahí desde TASK-007) usa `plans`, `slug-available`, `signup`, `tenant-ready` y
  `analytics/event`; el panel de plataforma (`apps/admin`,
  `https://app.ventea.tech/admin/plataforma`) el login, `tenants/*`, `billing/summary` y
  `analytics/funnel`. Los dos llaman a `/api` del mismo origen (Traefik manda
  `app.ventea.tech/api/*` a la API). En producción el CORS acepta además el apex
  `https://<TENANT_BASE_DOMAIN>` y un nivel de subdominio (`src/cors-origins.ts`), que incluye
  `app.`.
- **Dirección lista (`tenant-ready`):** tras el alta, la dirección tarda 1-2 min (ruta en
  Traefik + certificado de Let's Encrypt; mientras tanto el navegador da
  `ERR_CERT_AUTHORITY_INVALID` y, con HSTS, no deja seguir). La API hace un GET a
  `https://<slug>.<TENANT_BASE_DOMAIN>/api/health` con verificación TLS normal (timeout 3 s) y
  cachea la respuesta 10 s por slug. Solo slugs existentes y activos: no sirve para sondear hosts
  arbitrarios. La pantalla de éxito del registro la consulta cada 5 s.
- **Embudo (`analytics`):** el endpoint público acepta `event` ∈ `visit · cta_click ·
signup_start · signup_step_2 · signup_step_3` (lista blanca, body estricto: un campo extra o
  `signup_complete` es `400`). `signup_complete` lo suma la API al crear una marca por el
  registro (después del commit, sin bloquear el alta). Se guarda solo
  `funnel_daily_counts (day, event, count)`, con el día en `America/Tegucigalpa`; la IP solo la
  usa el rate limit en memoria. La landing lo manda con `navigator.sendBeacon`.
- **Detalle de marca:** incluye `openAttempts` (`{orderId, kind, status, amountCents,
createdAt}` de los cobros `pending`/`unknown`/`needs_review`): son los que se cierran con
  `resolve-payment`.
- **record-payment idempotente:** la misma `reference` (sin espacios extremos ni mayúsculas)
  en la misma marca → `409 "Ese pago ya fue registrado"`. En otra marca es otro pago.
- **Token de plataforma:** lleva `ver` (`PlatformAdmin.tokenVersion`); resetear la clave lo sube
  y todos los tokens vivos dejan de valer.
- **Región:** la asigna `REGIONS` por país: el del body, si no `CF-IPCountry` / `X-Country`.
- **Credenciales push:** se guardan solo `project_id`, `client_email` y `private_key`, cifrados
  con AES-256-GCM (`PUSH_CREDENTIALS_KEY`, el tenantId como dato asociado). Ninguna respuesta ni
  log las incluye; sin la variable → `503`.
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

# Una corrida del ciclo de cobro (mismo lock que el scheduler de la API)
node apps/api/dist/scripts/run-billing-cycle.js

# Reemplazar el menú de una marca desde un JSON. Corre en una transacción; los
# pedidos existentes no se tocan. Cambiar la moneda de una marca que ya tiene
# pedidos exige --force-currency.
node apps/api/dist/scripts/import-menu.js --tenant <slug> --file apps/api/prisma/data/carolina-menu.json
```
