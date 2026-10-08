#!/usr/bin/env bash
# Regenera la ruta de Traefik de la instancia de prueba a partir de los tenants
# activos de la base: un router (y un certificado Let's Encrypt HTTP-01) por
# subdominio. El Traefik compartido de la VPS solo lee archivos de
# /etc/traefik/dynamic y los recarga solo: no se reinicia nada.
#
# Un router por host, no un solo Host(a) || Host(b): así cada marca tiene su
# propio certificado y dar de alta una no reemite los de las demás.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a

DYNAMIC_DIR=/etc/traefik/dynamic
OUT=traefik-ventea-test.yml
UPSTREAM=http://ventea-test-api-1:3000
SSLIP_HOST=ventea-test.37-60-228-46.sslip.io

slugs=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select slug from tenants where \"isActive\" order by slug")

hosts="$SSLIP_HOST api.$TENANT_BASE_DOMAIN"
for s in $slugs; do hosts="$hosts $s.$TENANT_BASE_DOMAIN"; done

{
  echo "# GENERADO por sync-routes.sh ($(date -u +%FT%TZ)) - no editar a mano."
  echo "# ventea-test: backend Ventea de PRUEBA, compose ~/ventea-test. Provider File, NO gestionado por Dokploy."
  echo "# Revertir = borrar este archivo (Traefik recarga solo) + docker compose down -v en ~/ventea-test."
  echo "http:"
  echo "  routers:"
  for h in $hosts; do
    name="ventea-test-$(echo "$h" | tr '.' '-')"
    echo "    $name:"
    echo "      rule: \"Host(\`$h\`)\""
    echo "      entryPoints: [websecure]"
    echo "      service: ventea-test"
    echo "      tls:"
    echo "        certResolver: letsencrypt"
  done
  echo "  services:"
  echo "    ventea-test:"
  echo "      loadBalancer:"
  echo "        servers:"
  echo "          - url: \"$UPSTREAM\""
} > "$OUT"

# El directorio es de root y sudo pide password; el usuario está en el grupo docker.
docker run --rm -v "$DYNAMIC_DIR":/d -v "$PWD":/s:ro alpine \
  sh -c 'cp /s/traefik-ventea-test.yml /d/ventea-test.yml && chmod 644 /d/ventea-test.yml'

echo "✓ rutas publicadas:"; for h in $hosts; do echo "  https://$h"; done
