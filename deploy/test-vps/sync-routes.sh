#!/usr/bin/env bash
# Regenera la ruta de Traefik de la instancia de prueba a partir de los tenants
# activos de la base: un router (y un certificado Let's Encrypt HTTP-01) por
# subdominio. El Traefik compartido de la VPS solo lee archivos de
# /etc/traefik/dynamic y los recarga solo: no se reinicia nada.
#
# Un router por host, no un solo Host(a) || Host(b): así cada marca tiene su
# propio certificado y dar de alta una no reemite los de las demás.
#
# Cada subdominio de marca lleva DOS routers (TASK-003):
#   - `Host(x) && (PathPrefix(/api/) || Path(/api))` → API (priority alta);
#   - `Host(x)`                     → web (nginx: panel en /admin y menú en /).
# `/api/` con barra: `/apiary` o `/api-x` son del web, no de la API.
# Así el panel llama a /api del mismo origen, sin CORS. `api.` y el host sslip
# siguen yendo enteros a la API.
#
# `app.ventea.tech` (TASK-007: landing, registro y panel de plataforma; antes en el apex)
# lleva los mismos dos routers que una marca. El apex `ventea.tech` y `www.ventea.tech`
# van solo al web, que responde 301 a app. conservando ruta y query. nginx elige el sitio
# por el header Host (deploy/nginx.conf). `app` es un slug reservado: ninguna marca lo pisa.
#
# Corre por cron cada minuto (install-cron.sh, TASK-004): una marca registrada sola
# queda publicada con certificado en <= 2 min. Por eso SOLO reescribe el archivo de
# Traefik si el contenido cambió (hash sha256): reescribirlo igual cada minuto haría
# recargar la config a Traefik sin motivo.
#
#   ./sync-routes.sh            publica si cambió y lista las rutas
#   ./sync-routes.sh --quiet    sin salida si no hubo cambios (para cron)
#
# Una marca suspendida por falta de pago sigue en la lista: `isActive` sigue true y
# su staff tiene que poder entrar al panel a pagar (la API responde 402 al resto).
set -euo pipefail
cd "$(dirname "$0")"

QUIET=0
case "${1:-}" in
  --quiet | -q) QUIET=1 ;;
  "") ;;
  *) echo "uso: $0 [--quiet]" >&2; exit 2 ;;
esac

# Una corrida a la vez: si una tarda más de un minuto (docker lento, primer pull de
# alpine), la siguiente del cron sale sin hacer nada en vez de pisarla.
if command -v flock >/dev/null 2>&1; then
  exec 9>.sync-routes.lock
  if ! flock -n 9; then
    [ "$QUIET" = 1 ] || echo "= otra corrida de sync-routes en curso; nada que hacer"
    exit 0
  fi
fi

# Rotación del log del cron: si pasa de 1 MB (p. ej. postgres caído = un error por
# minuto), quedan las últimas 500 líneas. `cat >` conserva el archivo (y el `>>` del
# cron sigue escribiendo al final).
LOG=sync-routes.log
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then
  tail -n 500 "$LOG" > "$LOG.tmp" && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"
fi

set -a; . ./.env; set +a
# Vacío daría routers `Host(www.)` / `Host(api.)`: mejor fallar.
: "${TENANT_BASE_DOMAIN:?falta TENANT_BASE_DOMAIN en .env}"

DYNAMIC_DIR=/etc/traefik/dynamic
PUBLISHED="$DYNAMIC_DIR/ventea-test.yml"
OUT=traefik-ventea-test.yml
UPSTREAM=http://ventea-test-api-1:3000
WEB_UPSTREAM=http://ventea-test-web-1:80
SSLIP_HOST=ventea-test.37-60-228-46.sslip.io

slugs=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select slug from tenants where \"isActive\" order by slug")

api_hosts="$SSLIP_HOST api.$TENANT_BASE_DOMAIN"
app_host="app.$TENANT_BASE_DOMAIN"
apex_host="$TENANT_BASE_DOMAIN"
www_host="www.$TENANT_BASE_DOMAIN"
tenant_hosts=""
for s in $slugs; do tenant_hosts="$tenant_hosts $s.$TENANT_BASE_DOMAIN"; done

# router <nombre> <regla> <servicio> [priority]
router() {
  echo "    $1:"
  echo "      rule: \"$2\""
  echo "      entryPoints: [websecure]"
  echo "      service: $3"
  [ -n "${4:-}" ] && echo "      priority: $4"
  echo "      tls:"
  echo "        certResolver: letsencrypt"
}

# Sin fecha en el encabezado: el contenido tiene que ser idéntico si nada cambió, o el
# hash no serviría para decidir.
NEW="$(mktemp)"
trap 'rm -f "$NEW"' EXIT
{
  echo "# GENERADO por sync-routes.sh - no editar a mano."
  echo "# ventea-test: backend Ventea de PRUEBA, compose ~/ventea-test. Provider File, NO gestionado por Dokploy."
  echo "# Revertir = borrar este archivo (Traefik recarga solo) + docker compose down -v en ~/ventea-test."
  echo "http:"
  echo "  routers:"
  for h in $api_hosts; do
    router "ventea-test-$(echo "$h" | tr '.' '-')" "Host(\`$h\`)" ventea-test
  done
  # app. (landing + registro + panel de plataforma en /admin/plataforma) lleva los mismos
  # dos routers que una marca: su /api va a la API (mismo origen, sin CORS).
  # Priority web 50 (no 10) en app., apex y www: Traefik usa por defecto el largo de la
  # regla (Host de ventea.tech ≈ 19), así que con 10 cualquier otro router del Traefik
  # compartido que declare ese host ganaría en silencio. /api de app. sigue en 100 > 50.
  for h in $app_host $tenant_hosts; do
    name="ventea-test-$(echo "$h" | tr '.' '-')"
    web_priority=10
    [ "$h" = "$app_host" ] && web_priority=50
    router "$name-api" "Host(\`$h\`) && (PathPrefix(\`/api/\`) || Path(\`/api\`))" ventea-test 100
    router "$name-web" "Host(\`$h\`)" ventea-test-web "$web_priority"
  done
  # Apex y www: solo web; nginx responde 301 a app. (cada uno necesita su certificado para
  # que el https:// del redirect funcione).
  for h in $apex_host $www_host; do
    router "ventea-test-$(echo "$h" | tr '.' '-')-web" "Host(\`$h\`)" ventea-test-web 50
  done
  echo "  services:"
  echo "    ventea-test:"
  echo "      loadBalancer:"
  echo "        servers:"
  echo "          - url: \"$UPSTREAM\""
  echo "    ventea-test-web:"
  echo "      loadBalancer:"
  echo "        servers:"
  echo "          - url: \"$WEB_UPSTREAM\""
} > "$NEW"

new_hash=$(sha256sum "$NEW" | cut -d' ' -f1)
# Se compara contra lo PUBLICADO (el archivo es 644: se lee sin root). Si no se puede
# leer, contra la última copia local; si tampoco hay, se publica.
if [ -r "$PUBLISHED" ]; then
  current_hash=$(sha256sum "$PUBLISHED" | cut -d' ' -f1)
elif [ -r "$OUT" ]; then
  current_hash=$(sha256sum "$OUT" | cut -d' ' -f1)
else
  current_hash=""
fi

if [ "$new_hash" = "$current_hash" ]; then
  [ "$QUIET" = 1 ] || echo "= rutas sin cambios ($(echo "$tenant_hosts" | wc -w | tr -d ' ') marcas)"
  exit 0
fi

cp "$NEW" "$OUT"
# El directorio es de root y sudo pide password; el usuario está en el grupo docker.
docker run --rm -v "$DYNAMIC_DIR":/d -v "$PWD":/s:ro alpine \
  sh -c 'cp /s/traefik-ventea-test.yml /d/ventea-test.yml && chmod 644 /d/ventea-test.yml'

# En modo cron queda en sync-routes.log una entrada con fecha por cada cambio publicado.
echo "$(date -u +%FT%TZ) ✓ rutas publicadas:"
for h in $api_hosts; do echo "  https://$h (API)"; done
echo "  https://$app_host (landing + registro; panel de plataforma en /admin/plataforma; /api → API)"
echo "  https://$apex_host (301 → https://$app_host)"
echo "  https://$www_host (301 → https://$app_host)"
for h in $tenant_hosts; do echo "  https://$h (web + panel /admin, /api → API)"; done
