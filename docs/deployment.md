# Despliegue

**Ventea es un SaaS alojado por nosotros** ([ADR 0007](adr/0007-saas-multi-tenant.md)).
Una instancia en `TENANT_MODE=multi` atiende a todas las marcas, cada una en
`<slug>.ventea.tech`. Hoy corre en una VPS (región `hn-1`); con más regiones habrá una
instancia y una base por región.

## La plataforma (modo multi)

- **Rutas y certificados**: Traefik con un router y un certificado Let's Encrypt (HTTP-01)
  por subdominio. Un cron cada minuto (`sync-routes.sh --quiet`) regenera el archivo de
  rutas desde los tenants activos y solo lo reescribe si cambió: una marca registrada sola
  queda con certificado en menos de dos minutos, sin reiniciar el proxy. Detalle operativo
  en [`deploy/test-vps/README.md`](../deploy/test-vps/README.md).
- **Alta de marcas**: registro self-service (`POST /api/platform/signup`, prueba de 14
  días) o `create-tenant.js` (suscripción `active`, plan por flag).
- **Planes**: los siembra la migración `…_seed_plans_and_backfill_subscriptions` (SQL
  idempotente); no hay paso de seed aparte. La misma migración deja a todos los tenants
  existentes en plan Cadena anual `active`.
- **Administración**: cuentas `PlatformAdmin`, creadas con
  `node apps/api/dist/scripts/create-platform-admin.js --email <email> --name "<nombre>"`.
- **Variables nuevas** (opcionales): `REGIONS` (JSON, default
  `[{"code":"hn-1","countries":["*"]}]`) y `SIGNUP_RATE_LIMIT_PER_HOUR` (default 5 por IP).
- **Respaldos**: centralizados y copiados fuera de la VPS; ahora un disco perdido es el de
  todos los clientes.
- **Cobro de suscripciones** (TASK-005): ver [abajo](#cobro-de-suscripciones).
- **Medios y push** (TASK-016): volumen `media` y `PUSH_CREDENTIALS_KEY`, ver
  [abajo](#medios-de-las-marcas).

## Medios de las marcas

Las imágenes que suben las marcas (fotos del menú, logo, ícono) viven en el **volumen Docker
`media`**, montado en `/data/media` de la API (`MEDIA_DIR`). La imagen de la API crea ese
directorio con dueño `node`, así que un volumen nuevo ya nace escribible. Los dos compose
(`deploy/test-vps/docker-compose.yml` y `deploy/docker-compose.prod.yml`) lo declaran.

| Variable                           | Default                                | Qué hace                                                                            |
| ---------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| `MEDIA_DIR`                        | `/data/media` (prod) · `./media` (dev) | raíz de los archivos                                                                |
| `MEDIA_QUOTA_MB`                   | `200`                                  | cuota por marca (imagen + miniatura)                                                |
| `MEDIA_UPLOAD_RATE_LIMIT_PER_HOUR` | `60`                                   | subidas por marca y hora (en memoria, por proceso)                                  |
| `MEDIA_PROCESSING_CONCURRENCY`     | `2`                                    | imágenes que sharp procesa a la vez por proceso; el resto espera                    |
| `MEDIA_PROCESSING_WAIT_MS`         | `20000`                                | espera máxima por un lugar (después, `503`; más de 20 en fila, `503` en el acto)    |
| `MEDIA_PUBLIC_BASE_URL`            | host del request                       | base fija de las URLs absolutas (CDN o dominio canónico)                            |
| `PUSH_CREDENTIALS_KEY`             | vacía = push apagado                   | 32 bytes (`openssl rand -base64 32`) para cifrar las credenciales FCM de cada marca |

- **Respaldo:** el volumen `media` entra en el respaldo junto con la base: `backup.sh` deja un
  `ventea-media-<fecha>.tar.gz` al lado del `.sql.gz`. Restaurar la base sin los medios deja
  ítems y logos apuntando a archivos que no existen.
- **`PUSH_CREDENTIALS_KEY`** va al gestor de secretos, fuera de la VPS. Perderla deja ilegibles
  las credenciales FCM guardadas (se vuelven a cargar marca por marca); mal formada, la API no
  arranca. Rotarla exige volver a cargar las credenciales de todas las marcas.
- **Memoria:** el servicio `api` corre con `mem_limit: 768m` en los dos compose. sharp decodifica
  fuera del heap de Node (hasta 24 MP por imagen, ~100 MB); con el semáforo de 2 y el tope, un
  abuso reinicia la API en vez de dejar sin memoria a la VPS.
- **Proxy:** la subida es `multipart` hasta 5 MB y va directo a la API (Traefik / Caddy no limitan
  el cuerpo por defecto). Si se pone un proxy con límite (nginx: `client_max_body_size`), dejar
  al menos 6 MB en `/api/staff/media`.
- **Verificación tras desplegar:** subir una imagen desde Mi marca o el menú de una marca de
  prueba → asignarla a un ítem → `GET /api/menu` la muestra con URL absoluta → abrirla (200,
  `image/webp`) → `GET /api/tenant` trae `logoUrl`/`iconUrl` absolutos.

## Cobro de suscripciones

La API cobra las renovaciones sola: `BillingScheduler` corre el ciclo cada 15 minutos en cada
réplica y un `pg_try_advisory_lock` deja cobrar a una sola. No hace falta cron.

| Variable                         | Default       | Qué es                                                                                          |
| -------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `BILLING_MODE`                   | `manual`      | `manual`: sin pasarela, el admin registra los pagos. `ms-payments`: tarjeta vía ms-payments     |
| `MS_PAYMENTS_URL`                | —             | Base de ms-payments sin `/api`, por red interna. Obligatoria con `ms-payments`                  |
| `MS_PAYMENTS_KEY`                | —             | `INTERNAL_SERVICE_KEY` de ms-payments (`X-Internal-Service-Key`). Obligatoria con `ms-payments` |
| `MS_PAYMENTS_PROVIDER`           | `cybersource` | `X-Payment-Provider`. Solo CyberSource cobra recurrente sin CVV                                 |
| `MS_PAYMENTS_TIMEOUT_MS`         | `30000`       | Timeout por llamada; vencido = cobro desconocido (se concilia, no se recobra)                   |
| `BILLING_CYCLE_INTERVAL_MINUTES` | `15`          | Cada cuánto corre el ciclo                                                                      |
| `BILLING_SCHEDULER_ENABLED`      | `true`        | `false` apaga el scheduler (el script `run-billing-cycle.js` sigue funcionando)                 |
| `BILLING_RATE_LIMIT_PER_HOUR`    | `5`           | Altas de tarjeta por marca y hora                                                               |
| `BILLING_IP_RATE_LIMIT_PER_DAY`  | `10`          | Altas de tarjeta por IP y día, entre todas las marcas (card-testing con el registro público)    |
| `ALLOW_RAW_CARD_API`             | —             | `true` permite el alta con número crudo en producción con `ms-payments` (ver PCI, abajo)        |

Con `BILLING_MODE=ms-payments` y sin URL o clave, **la API no arranca**: falla al desplegar, no
en la primera renovación.

### Modo manual (hoy, en la VPS)

El ciclo no cobra: pasa a `past_due` las pruebas y los períodos vencidos, y a `suspended` tras 7
días de gracia. Durante la gracia de un período pagado la marca sigue atendiendo y el panel
avisa con la fecha de fin (TASK-007); una prueba vencida sin pago queda en 402 de inmediato. Cuando el cliente paga (transferencia), el admin de plataforma lo registra:

```bash
curl -X POST "https://<host-api>/api/platform/tenants/<slug>/record-payment" \
  -H "Authorization: Bearer $PLATFORM_TOKEN" -H "Content-Type: application/json" \
  -d '{"amountCents": 5900, "reference": "TRF-0001"}'
```

Abre un período desde hoy (o desde el fin del vigente, si paga por adelantado) y deja la marca
`active`. No toca una cancelación agendada por el dueño. El servicio `api` de los compose
lleva `stop_grace_period: 40s`: el apagado espera la corrida de cobro en curso (hasta 35 s). Con un cobro con tarjeta sin
confirmar responde `409`: primero `resolve-payment`.

### Alertas

`GET /api/platform/billing/summary` trae `unresolvedPayments` (cobros sin confirmar y
rechazados por la pasarela antes del banco) y `alertsLast7Days` (`billing_alert`: posible
doble pago, monto aprobado distinto del pedido, card-testing). Los dos tienen que estar en 0;
si no, revisar el detalle de la marca y EBC.

### Puesta en marcha con CyberSource (no verificada: faltan credenciales)

1. **ms-payments con CyberSource**, en la red interna de la API y sin exponerlo a internet:
   `INTERNAL_SERVICE_KEY` larga y aleatoria, `CYBERSOURCE_MERCHANT_ID`, `CYBERSOURCE_KEY_ID` y
   `CYBERSOURCE_SHARED_SECRET` (portal EBC → Gestión de claves → API REST, secreto compartido).
   Producción exige `NODE_ENV=production` **y** `CYBERSOURCE_ENV=production` en ms-payments;
   verificarlo en su `/health` (`environments.cybersource.environment`).
2. **Sandbox primero.** Con ms-payments contra `apitest.cybersource.com`, en la API:
   `BILLING_MODE=ms-payments`, `MS_PAYMENTS_URL=http://ms-payments:3000`,
   `MS_PAYMENTS_KEY=<INTERNAL_SERVICE_KEY>`, `MS_PAYMENTS_PROVIDER=cybersource`. Desplegar y
   verificar que la API arranca.
3. **Alta de prueba:** con una marca de prueba en `trialing`, `POST /api/billing/payment-method`
   con la tarjeta de sandbox `4111 1111 1111 1111`. Verificar que `subscriptions.paymentToken`
   y `networkTransactionId` quedaron, y que no hay PAN en `billing_events`, `payment_attempts`
   ni en `docker logs`.
4. **Renovación de prueba:** poner en el pasado el `currentPeriodEnd` de esa marca y correr
   `node apps/api/dist/scripts/run-billing-cycle.js`: debe salir `charged.approved = 1` y, en
   EBC, un cobro recurrente sin CVV que referencia el `networkTransactionId` del alta.
5. **Producción:** BAC tiene certificado el stack con el plugin de PixelPay; cobrar directo por
   CyberSource **exige re-certificar** y confirmar que el MID `bac_hn_oncorp` admite conexión
   directa (README de ms-payments). Recién entonces, ms-payments a producción.
6. **Rollback:** `BILLING_MODE=manual` y redeploy de la API. Los intentos en vuelo quedan en
   `payment_attempts`; los `unknown` se cierran con `resolve-payment` tras mirarlos en EBC.

**PCI — requisito antes de cobrar en producción:** hoy `POST /api/billing/payment-method`
recibe el número de tarjeta: pasa por la memoria de la API y de ms-payments (alcance SAQ D),
aunque no se guarda ni se loguea. **Antes de activar `BILLING_MODE=ms-payments` en
producción hay que migrar a `capture-context` (Microform de CyberSource)**: el navegador
tokeniza contra el procesador y la API recibe solo el token (SAQ A). Mientras tanto, con
`NODE_ENV=production` y `BILLING_MODE=ms-payments`, el endpoint responde `503` salvo
`ALLOW_RAW_CARD_API=true`, que es una decisión explícita (y documentada en el cambio de
configuración) de aceptar SAQ D. En sandbox y en desarrollo no aplica.

## Instalación dedicada (modo single, excepcional)

Lo que sigue describe una instalación dedicada a un solo cliente, el modelo del ADR 0006,
que queda solo para quien exija aislamiento físico por contrato.

### Qué corre en una instalación dedicada

```
                       Internet
                          │
                    ┌─────▼──────┐
                    │   Caddy    │  :443 · TLS automático (Let's Encrypt)
                    │   proxy    │
                    └──┬──────┬──┘
             /api/*    │      │    resto
                  ┌────▼──┐ ┌─▼──────────┐
                  │  api  │ │    web     │  nginx sirve estáticos:
                  │ :3000 │ │    :80     │   /       menú público
                  └────┬──┘ └────────────┘   /admin  panel de gestión
                       │
                 ┌─────▼──────┐
                 │  postgres  │  sin puerto publicado al host
                 └─────┬──────┘
                       │
                    [volumen pgdata]
```

Cuatro contenedores más un servicio `migrate` que corre una vez y termina. Todo está en
[`deploy/docker-compose.prod.yml`](../deploy/docker-compose.prod.yml).

Postgres **no publica puerto al host**. Se llega solo por la red interna de Docker;
exponer 5432 en un VPS es ofrecer la base al primer escaneo de internet.

### Modo single-tenant

En una instalación dedicada el tenant no se resuelve por subdominio: se fija en la
configuración.

```env
TENANT_MODE=single
TENANT_SLUG=carolina-hot-chicken
```

Con `single`, `TenantMiddleware` ignora el host y el header `X-Tenant-Slug`. Nada que
mande el cliente cambia de qué marca son los datos que ve.

El modo `multi` es el de producción de la plataforma y el de desarrollo.

### Puesta en marcha de una instalación dedicada

**Requisitos**: VPS con Docker y Docker Compose, y el DNS del dominio ya apuntando al
VPS. Si el DNS todavía no resolvió, el desafío ACME falla y Caddy deja el sitio sin
certificado durante varios minutos.

```bash
# 1 · En el VPS
mkdir -p /opt/ventea && cd /opt/ventea

# 2 · Copiar desde el repo: compose, Caddyfile y los scripts de operación
#     (deploy/docker-compose.prod.yml, deploy/Caddyfile, deploy/deploy.sh, deploy/backup.sh)

# 3 · Configuración del cliente
cp .env.production.example .env
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
# editar .env: DOMAIN, TENANT_SLUG, IMAGE_API, IMAGE_WEB y los secretos generados

# 4 · Levantar
docker compose -f docker-compose.prod.yml --env-file .env up -d

# 5 · Crear el tenant y su usuario dueño
docker compose exec api node apps/api/dist/scripts/create-tenant.js \
  --slug carolina-hot-chicken --name "Carolina Hot Chicken" --owner-email dueno@ejemplo.com

# 6 · Verificar contra el sitio publicado, no contra la salida del comando
curl https://<dominio>/api/health
```

**Un `JWT_SECRET` distinto por cliente.** Reusarlo entre instancias haría que un token
emitido para un cliente valga en la instancia de otro.

### Actualizaciones

```bash
cd /opt/ventea && ./deploy.sh 0.2.0
```

[`deploy.sh`](../deploy/deploy.sh) hace, en este orden: respaldo → fijar la versión en
`.env` → `pull` → migrar → levantar → verificar `/api/health`.

El orden no es decorativo. Migrar sin respaldo previo deja sin punto de retorno si la
migración sale mal, y en ese momento la base ya cambió de forma.

**Siempre una etiqueta de versión concreta, nunca `latest`.** Con `latest` nadie sabe qué
está corriendo en cada cliente, y un `docker compose up` de rutina puede cambiar la
versión sin que nadie lo haya pedido.

**Rollback**: `./deploy.sh <versión-anterior>`. Sirve mientras la migración sea
compatible hacia atrás; si una migración borra una columna, volver a la imagen anterior
no alcanza y hay que restaurar el respaldo. Por eso las migraciones destructivas se
parten en dos versiones: primero dejar de usar la columna, después borrarla.

## Respaldos

[`backup.sh`](../deploy/backup.sh) hace `pg_dump` comprimido y un `tar.gz` del volumen
`media` (imágenes de las marcas, TASK-016), con retención de 14 días.
Por cron en el VPS:

```cron
0 3 * * * /opt/ventea/backup.sh >> /var/log/ventea-backup.log 2>&1
```

El script verifica que el archivo no salga vacío: `pg_dump` puede fallar después de que
`gzip` ya creó el archivo, y un `.gz` de 20 bytes se ve como un respaldo válido en un
listado de directorio.

**Un respaldo que nunca se restauró no es un respaldo.** Probar la restauración sobre
una base descartable antes de confiar en él.

Los respaldos quedan en el mismo VPS, que es exactamente donde no sirven si el VPS se
pierde. Copiarlos afuera —almacenamiento del proveedor, otro servidor— es parte de la
puesta en marcha, no un extra.

## App móvil

El binario nativo no se despliega en el servidor: va a las tiendas y **apunta a la API de
la marca** (`https://<slug>.ventea.tech`). Esa URL se hornea en tiempo de build (Vite la
resuelve al construir, no al ejecutar), así que cada marca tiene su propio binario:

```bash
VITE_API_URL=https://carolina-hot-chicken.ventea.tech \
VITE_DEFAULT_TENANT_SLUG=carolina-hot-chicken \
VENTEA_APP_ID=app.ventea.carolina \
npm run build -w @ventea/mobile && npx cap sync
```

Detalle en [white-label.md](white-label.md).

## Consecuencias del modelo SaaS

Ver [ADR 0007](adr/0007-saas-multi-tenant.md). En corto: un despliegue actualiza a todos
(sin versiones divergentes), pero una caída o una migración mala afecta a todos a la
vez. Antes del primer cliente real con datos: RLS (TASK-007), monitoreo y respaldos
fuera de la VPS.

## Qué falta

- **Publicación de imágenes**: falta el workflow que construya y publique
  `ventea-api` y `ventea-web` etiquetadas por versión en un registry.
- **Endpoint de versión en el front**: el `/api/health` ya devuelve la de la API; falta
  poder verificar qué build del front está servido.
