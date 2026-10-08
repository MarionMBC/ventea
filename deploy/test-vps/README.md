# Instancia de prueba en la VPS compartida (37.60.228.46)

Ventea (API + web con el panel de staff) en modo `multi` (`TENANT_BASE_DOMAIN=ventea.tech`), **solo para pruebas**,
corriendo junto a otros servicios en la VPS de VIAJU. No usa el Caddy de
`deploy/docker-compose.prod.yml`: el Traefik que ya atiende 80/443 en esa VPS termina TLS.

- Carpeta en la VPS: `~/ventea-test` (`docker-compose.yml`, `.env` con secretos generados
  allá — nunca en el repo — y estos scripts).
- Traefik de esa VPS lee **solo** archivos de `/etc/traefik/dynamic` (provider File; ni
  labels de Docker ni `/etc/dokploy/traefik`). La ruta es `/etc/traefik/dynamic/ventea-test.yml`.
- DNS: `*.ventea.tech` y `ventea.tech` → `37.60.228.46`.

## Rutas

`sync-routes.sh` genera `/etc/traefik/dynamic/ventea-test.yml` desde los tenants activos:

| Host                          | Ruta             | Servicio                                    |
| ----------------------------- | ---------------- | ------------------------------------------- |
| `api.ventea.tech`, host sslip | todo             | `api` (`ventea-test-api-1:3000`)            |
| `<slug>.ventea.tech`          | `/api`, `/api/*` | `api` (priority 100)                        |
| `<slug>.ventea.tech`          | el resto         | `web` (`ventea-test-web-1:80`, priority 10) |

En `web` (nginx, `deploy/Dockerfile.web`) el panel de staff vive en `/admin` y llama a `/api`
del mismo origen, así que no hay CORS de por medio. En `/` queda el build web de `apps/mobile`.
El panel: `https://<slug>.ventea.tech/admin`.

## Alta de una marca

```bash
cd ~/ventea-test
./new-tenant.sh --slug pollos-juan --name "Pollos Juan" --owner-email juan@correo.com
```

Crea el tenant y regenera las rutas: un certificado Let's Encrypt (HTTP-01) por subdominio,
así dar de alta una marca no reemite los certificados de las demás. Traefik recarga el archivo
solo; no se reinicia nada. `https://pollos-juan.ventea.tech/admin` queda activo en segundos.

Si una marca se desactiva o se borra a mano, correr `./sync-routes.sh` para quitar su ruta.

## Desplegar otra versión

Orden obligatorio: **build de la imagen web → `IMAGE_WEB=<tag>` en `.env` → `docker compose up -d`
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
docker compose up -d
./sync-routes.sh
curl https://api.ventea.tech/api/health
curl -I https://carolina-hot-chicken.ventea.tech/admin/   # 200, el panel
```

La imagen web no lleva `VITE_*`: el panel usa `/api` relativo y el tenant sale del subdominio.

## Quitarlo

```bash
docker run --rm -v /etc/traefik/dynamic:/d alpine rm /d/ventea-test.yml
cd ~/ventea-test && docker compose down -v
```
