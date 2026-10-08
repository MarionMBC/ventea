# Instancia de prueba en la VPS compartida (37.60.228.46)

Ventea (API + web con el panel de staff) en modo `multi` (`TENANT_BASE_DOMAIN=ventea.tech`), **solo para pruebas**,
corriendo junto a otros servicios en la VPS de VIAJU. Es la región `hn-1` del SaaS (ADR 0007). No usa el Caddy de
`deploy/docker-compose.prod.yml`: el Traefik que ya atiende 80/443 en esa VPS termina TLS.

- Carpeta en la VPS: `~/ventea-test` (`docker-compose.yml`, `.env` con secretos generados
  allá — nunca en el repo — y estos scripts).
- Traefik de esa VPS lee **solo** archivos de `/etc/traefik/dynamic` (provider File; ni
  labels de Docker ni `/etc/dokploy/traefik`). La ruta es `/etc/traefik/dynamic/ventea-test.yml`.
- DNS: `*.ventea.tech` y `ventea.tech` → `37.60.228.46`.

## Rutas

`sync-routes.sh` genera `/etc/traefik/dynamic/ventea-test.yml` desde los tenants activos
(`isActive`; una marca **suspendida** por falta de pago sigue publicada: su staff entra a pagar y la
API responde `402` al resto):

| Host                          | Ruta             | Servicio                                    |
| ----------------------------- | ---------------- | ------------------------------------------- |
| `api.ventea.tech`, host sslip | todo             | `api` (`ventea-test-api-1:3000`)            |
| `<slug>.ventea.tech`          | `/api`, `/api/*` | `api` (priority 100)                        |
| `<slug>.ventea.tech`          | el resto         | `web` (`ventea-test-web-1:80`, priority 10) |
| `ventea.tech` (apex)          | `/api`, `/api/*` | `api` (priority 100)                        |
| `ventea.tech` (apex)          | el resto         | `web` (priority 10): landing y registro     |
| `www.ventea.tech`             | todo             | `web`: nginx responde `301` al apex         |

En `web` (nginx, `deploy/Dockerfile.web`) el panel de staff vive en `/admin` y llama a `/api`
del mismo origen, así que no hay CORS de por medio. En `/` queda el build web de `apps/mobile`.
El panel: `https://<slug>.ventea.tech/admin`.

En el apex, el mismo nginx (otro `server` por `Host`, ver `deploy/nginx.conf`) sirve la landing
(`apps/landing`) en `/` y `/registro`, y el panel en `/admin/` — el de plataforma en
`https://ventea.tech/admin/plataforma` (`/plataforma` redirige). La landing y el panel llaman a
`ventea.tech/api` (mismo origen). Las rutas del apex y de `www` son fijas: las publica
`sync-routes.sh` en cada corrida, cada una con su certificado.

### Rutas automáticas (cron)

Un cron del usuario de la instancia (`henry`, grupo docker) corre `sync-routes.sh --quiet` cada
minuto. El script compara el sha256 del archivo nuevo con el publicado y **solo lo reescribe si
cambió**; con `--quiet` no escribe nada en el log si no hubo cambios. Así una marca que se
registra sola (`POST /api/platform/signup`) queda con certificado en ≤ 2 min, sin reiniciar
Traefik, y una marca desactivada pierde su ruta en el minuto siguiente. Corre con `flock -n`
(`.sync-routes.lock`): si una corrida tarda más de un minuto, la siguiente no la pisa. Si
`sync-routes.log` pasa de 1 MB, el propio script lo recorta a las últimas 500 líneas.

```bash
cd ~/ventea-test
./install-cron.sh          # idempotente: instala la línea o la deja como está
./install-cron.sh --remove # la quita
tail -f sync-routes.log    # una entrada con fecha por cada publicación (o error)
```

La línea que instala (el comentario final es la marca con que la reconoce; el resto del
crontab no se toca):
`* * * * * cd ~/ventea-test && ./sync-routes.sh --quiet >> sync-routes.log 2>&1 # ventea-sync-routes`.
Si `docker` no está en `/usr/bin` (PATH de cron), agregar `PATH=...` arriba del crontab.

## Alta de una marca

Registro self-service (prueba de 14 días; el cron publica el subdominio). Cupo global en la
base: 10 altas por día y 25 por semana (`SIGNUP_DAILY_LIMIT`, `SIGNUP_WEEKLY_LIMIT`), por el
límite de 50 certificados semanales de Let's Encrypt; lleno → `429`.

```bash
curl -sS https://api.ventea.tech/api/platform/signup -H 'Content-Type: application/json' -d '{
  "restaurantName": "Pollos Juan", "slug": "pollos-juan", "ownerName": "Juan",
  "ownerEmail": "juan@correo.com", "ownerPassword": "<mínimo 10>",
  "planCode": "pro", "interval": "month"}'
```

O por operación (suscripción `active`, plan Cadena anual salvo `--plan`/`--interval`):

```bash
cd ~/ventea-test
./new-tenant.sh --slug pollos-juan --name "Pollos Juan" --owner-email juan@correo.com [--plan basic]
```

`new-tenant.sh` crea el tenant y publica las rutas en el acto. Un certificado Let's Encrypt
(HTTP-01) por subdominio, así dar de alta una marca no reemite los de las demás.

## Plataforma (admin del SaaS)

Panel web: `https://ventea.tech/admin/plataforma` (login propio; el token dura 1 h y al vencer
vuelve al login). Lista de marcas con filtro y búsqueda, detalle con eventos y acciones
(suspender, reactivar, cambiar plan, extender prueba; «Registrar pago» aparece solo cuando la
API tiene `record-payment`, TASK-005). Lo mismo por `curl`:

```bash
# una vez: crea el admin y muestra su contraseña UNA vez
docker compose exec -T api node apps/api/dist/scripts/create-platform-admin.js   --email <tu-email> --name "<tu nombre>"
# login → token (1 h)
curl -sS https://api.ventea.tech/api/platform/auth/login -H 'Content-Type: application/json'   -d '{"email":"<tu-email>","password":"<la impresa>"}'
# resetear la clave (invalida en el acto los tokens vivos: tokenVersion)
docker compose exec -T api node apps/api/dist/scripts/create-platform-admin.js   --email <tu-email> --reset-password
# suspender / reactivar / cambiar plan / extender prueba
curl -sS -X POST https://api.ventea.tech/api/platform/tenants/pollos-juan/suspend -H "Authorization: Bearer $T"
curl -sS -X POST https://api.ventea.tech/api/platform/tenants/pollos-juan/reactivate -H "Authorization: Bearer $T"
```

## Desplegar otra versión

Orden obligatorio: **backup → build de las imágenes → `IMAGE_API`/`IMAGE_WEB=<tag>` en `.env` →
`docker compose up -d` (el servicio `migrate` corre `prisma migrate deploy` antes de levantar la
API; las migraciones siembran los planes y dejan a los tenants existentes en Cadena anual `active`)
→ `./sync-routes.sh`**. El compose exige `IMAGE_WEB` (`${IMAGE_WEB:?…}`): sin ella o vacía,
TODO comando `docker compose` falla, incluidos los `compose exec` de `sync-routes.sh` y
`new-tenant.sh`. Nunca dejar `IMAGE_WEB=` vacío. La primera vez que se agrega `web`, la
variable no existe en el `.env` de la VPS: agregarla (línea nueva) antes de copiar el compose.

```bash
# local
git archive --format=tar.gz -o ventea.tgz HEAD && scp ventea.tgz 37.60.228.46:ventea-test/
# VPS
cd ~/ventea-test && rm -rf src && mkdir src && tar xzf ventea.tgz -C src
docker build -f src/deploy/Dockerfile.api -t ventea-api:0.1.0-<commit> src
docker build -f src/deploy/Dockerfile.web -t ventea-web:0.1.0-<commit> src
sed -i 's/^IMAGE_API=.*/IMAGE_API=ventea-api:0.1.0-<commit>/' .env
grep -q '^IMAGE_WEB=' .env   && sed -i 's/^IMAGE_WEB=.*/IMAGE_WEB=ventea-web:0.1.0-<commit>/' .env   || echo 'IMAGE_WEB=ventea-web:0.1.0-<commit>' >> .env
cp src/deploy/test-vps/docker-compose.yml src/deploy/test-vps/*.sh .   # si cambiaron
chmod +x *.sh
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F-%H%M).sql.gz
docker compose up -d
docker compose logs migrate | tail -5     # "All migrations have been successfully applied"
curl -fsS https://api.ventea.tech/api/health   # REGIONS mal escrito = la API no arranca (todas las marcas)
./sync-routes.sh
./install-cron.sh                          # una vez (idempotente)
curl https://api.ventea.tech/api/health
curl -I https://carolina-hot-chicken.ventea.tech/admin/   # 200, el panel
curl -I https://ventea.tech/                  # 200, la landing
curl -I https://ventea.tech/registro          # 200 (mismo index.html)
curl -s https://ventea.tech/api/platform/plans | head -c 200   # precios por el apex
curl -I https://www.ventea.tech/              # 301 → https://ventea.tech/
curl -I https://ventea.tech/admin/plataforma  # 200, panel de plataforma
```

La imagen web no lleva `VITE_*`: el panel y la landing usan `/api` relativo y el tenant sale
del subdominio. La primera vez que se publica el apex, Traefik pide los certificados de
`ventea.tech` y `www.ventea.tech` (HTTP-01; el DNS ya apunta a la VPS): pueden tardar ~1 min.
Si otro router del Traefik compartido ya atendía `Host(ventea.tech)`, hay que quitarlo antes.

## Quitarlo

```bash
./install-cron.sh --remove   # primero: si no, el cron vuelve a publicar las rutas
docker run --rm -v /etc/traefik/dynamic:/d alpine rm /d/ventea-test.yml
cd ~/ventea-test && docker compose down -v
```
