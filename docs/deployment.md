# Despliegue

**Una instancia por cliente, en su propio VPS u hosting.** No hay una nube central de
Ventea a la que se conecten todos: cada cliente corre su copia completa —base de datos,
API y front— sobre su propia infraestructura, con su dominio y su certificado.

## Qué corre en el VPS de un cliente

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

## Modo single-tenant

Como cada cliente tiene su instancia, el tenant no se resuelve por subdominio: se fija
en la configuración.

```env
TENANT_MODE=single
TENANT_SLUG=carolina-hot-chicken
```

Con `single`, `TenantMiddleware` ignora el host y el header `X-Tenant-Slug`. Nada que
mande el cliente cambia de qué marca son los datos que ve.

El modo `multi` sigue existiendo y es el que se usa en desarrollo —permite saltar entre
tenants y probar el aislamiento— y quedaría disponible si en algún momento conviene
alojar varios clientes chicos en una instancia nuestra.

> El esquema mantiene `tenantId` en toda tabla aunque la instancia atienda una sola
> marca. Sacarlo ahorraría una columna y cerraría la puerta a alojar clientes juntos,
> a que un cliente tenga dos marcas, y a consolidar instancias más adelante. Ver
> [ADR 0006](adr/0006-despliegue-por-cliente.md).

## Puesta en marcha de un cliente nuevo

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

## Actualizaciones

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

[`backup.sh`](../deploy/backup.sh) hace `pg_dump` comprimido con retención de 14 días.
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

El binario nativo no se despliega en el VPS: va a las tiendas y **apunta a la API del
cliente**. Esa URL se hornea en tiempo de build (Vite la resuelve al construir, no al
ejecutar), así que cada marca tiene su propio binario:

```bash
VITE_API_URL=https://pedidos.carolinahotchicken.cl \
VITE_DEFAULT_TENANT_SLUG=carolina-hot-chicken \
VENTEA_APP_ID=app.ventea.carolina \
npm run build -w @ventea/mobile && npx cap sync
```

Detalle en [white-label.md](white-label.md).

## Consecuencias de este modelo

Lo que se gana: los datos del cliente quedan en su infraestructura (argumento de venta
real y respuesta simple a cualquier pregunta sobre privacidad), no operamos una nube
central con el riesgo de que una caída afecte a todos, y no hay costo de infraestructura
por cliente para nosotros.

Lo que cuesta, y hay que tenerlo previsto antes del tercer cliente:

- **Actualizar es N despliegues.** Con cinco clientes es un rato; con treinta, hace falta
  automatizarlo (Ansible o similar) o el parche de seguridad no llega a todos.
- **Versiones divergentes.** Cada cliente puede quedarse atrás. Hay que llevar registro
  de qué versión corre cada uno.
- **Diagnóstico a ciegas.** No hay acceso a los logs salvo que el cliente lo dé. Conviene
  definir desde ahora qué se registra y cómo se pide.
- **El VPS es responsabilidad de alguien.** Si el cliente lo administra, el sistema
  depende de que aplique parches del sistema operativo. Conviene que quede por escrito
  quién mantiene qué.

## Qué falta

- **Publicación de imágenes**: falta el workflow que construya y publique
  `ventea-api` y `ventea-web` etiquetadas por versión en un registry.
- **Endpoint de versión en el front**: el `/api/health` ya devuelve la de la API; falta
  poder verificar qué build del front está servido.
