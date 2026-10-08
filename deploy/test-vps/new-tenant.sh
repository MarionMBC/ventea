#!/usr/bin/env bash
# Alta de una marca en la instancia de prueba: crea el tenant y publica su
# subdominio <slug>.$TENANT_BASE_DOMAIN con certificado propio.
#
#   ./new-tenant.sh --slug pollos-juan --name "Pollos Juan" --owner-email juan@correo.com
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T api node apps/api/dist/scripts/create-tenant.js "$@"
./sync-routes.sh
