# Instancia de prueba en la VPS compartida (37.60.228.46)

Backend Ventea en modo `multi` (`TENANT_BASE_DOMAIN=ventea.tech`), **solo para pruebas**,
corriendo junto a otros servicios en la VPS de VIAJU. No usa el Caddy de
`deploy/docker-compose.prod.yml`: el Traefik que ya atiende 80/443 en esa VPS termina TLS.

- Carpeta en la VPS: `~/ventea-test` (`docker-compose.yml`, `.env` con secretos generados
  allá — nunca en el repo — y estos scripts).
- Traefik de esa VPS lee **solo** archivos de `/etc/traefik/dynamic` (provider File; ni
  labels de Docker ni `/etc/dokploy/traefik`). La ruta es `/etc/traefik/dynamic/ventea-test.yml`.
- DNS: `*.ventea.tech` y `ventea.tech` → `37.60.228.46`.

## Alta de una marca

```bash
cd ~/ventea-test
./new-tenant.sh --slug pollos-juan --name "Pollos Juan" --owner-email juan@correo.com
```

Crea el tenant y regenera la ruta: un router y un certificado Let's Encrypt (HTTP-01) por
subdominio, así dar de alta una marca no reemite los certificados de las demás. Traefik
recarga el archivo solo; no se reinicia nada. `https://pollos-juan.ventea.tech` queda
activo en segundos.

Si una marca se desactiva o se borra a mano, correr `./sync-routes.sh` para quitar su ruta.

## Desplegar otra versión

```bash
# local
git archive --format=tar.gz -o ventea.tgz HEAD && scp ventea.tgz 37.60.228.46:ventea-test/
# VPS
cd ~/ventea-test && rm -rf src && mkdir src && tar xzf ventea.tgz -C src
docker build -f src/deploy/Dockerfile.api -t ventea-api:0.1.0-<commit> src
sed -i 's/^IMAGE_API=.*/IMAGE_API=ventea-api:0.1.0-<commit>/' .env && docker compose up -d
curl https://api.ventea.tech/api/health
```

## Quitarlo

```bash
docker run --rm -v /etc/traefik/dynamic:/d alpine rm /d/ventea-test.yml
cd ~/ventea-test && docker compose down -v
```
