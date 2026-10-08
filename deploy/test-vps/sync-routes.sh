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
#   - `Host(x) && PathPrefix(/api)` → API (priority alta: gana siempre en /api);
#   - `Host(x)`                     → web (nginx: panel en /admin y menú en /).
# Así el panel llama a /api del mismo origen, sin CORS. `api.` y el host sslip
# siguen yendo enteros a la API.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a

DYNAMIC_DIR=/etc/traefik/dynamic
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

{
  echo "# GENERADO por sync-routes.sh ($(date -u +%FT%TZ)) - no editar a mano."
  echo "# ventea-test: backend Ventea de PRUEBA, compose ~/ventea-test. Provider File, NO gestionado por Dokploy."
  echo "# Revertir = borrar este archivo (Traefik recarga solo) + docker compose down -v en ~/ventea-test."
  echo "http:"
  echo "  routers:"
  for h in $api_hosts; do
    router "ventea-test-$(echo "$h" | tr '.' '-')" "Host(\`$h\`)" ventea-test
  done
  for h in $tenant_hosts; do
    name="ventea-test-$(echo "$h" | tr '.' '-')"
    router "$name-api" "Host(\`$h\`) && PathPrefix(\`/api\`)" ventea-test 100
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
} > "$OUT"

# El directorio es de root y sudo pide password; el usuario está en el grupo docker.
docker run --rm -v "$DYNAMIC_DIR":/d -v "$PWD":/s:ro alpine \
  sh -c 'cp /s/traefik-ventea-test.yml /d/ventea-test.yml && chmod 644 /d/ventea-test.yml'

echo "✓ rutas publicadas:"
for h in $api_hosts; do echo "  https://$h (API)"; done
for h in $tenant_hosts; do echo "  https://$h (web + panel /admin, /api → API)"; done
