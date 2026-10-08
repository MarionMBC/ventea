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

set -a; . ./.env; set +a

DYNAMIC_DIR=/etc/traefik/dynamic
PUBLISHED="$DYNAMIC_DIR/ventea-test.yml"
OUT=traefik-ventea-test.yml
UPSTREAM=http://ventea-test-api-1:3000
WEB_UPSTREAM=http://ventea-test-web-1:80
SSLIP_HOST=ventea-test.37-60-228-46.sslip.io

slugs=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select slug from tenants where \"isActive\" order by slug")

api_hosts="$SSLIP_HOST api.$TENANT_BASE_DOMAIN"
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
  for h in $tenant_hosts; do
    name="ventea-test-$(echo "$h" | tr '.' '-')"
    router "$name-api" "Host(\`$h\`) && (PathPrefix(\`/api/\`) || Path(\`/api\`))" ventea-test 100
    router "$name-web" "Host(\`$h\`)" ventea-test-web 10
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
for h in $tenant_hosts; do echo "  https://$h (web + panel /admin, /api → API)"; done
