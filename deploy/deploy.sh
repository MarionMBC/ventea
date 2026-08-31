#!/usr/bin/env bash
# Actualiza la instancia de un cliente a una versión concreta.
#
#   ./deploy.sh 0.2.0
#
# El orden importa: respaldo, luego bajar imágenes, luego migrar, luego levantar.
# Migrar sin respaldo previo deja sin punto de retorno si la migración sale mal.
set -euo pipefail

VERSION="${1:?Uso: ./deploy.sh <version>   ej: ./deploy.sh 0.2.0}"
DIR="${DIR:-/opt/ventea}"
cd "$DIR"

echo "→ Respaldo previo"
./backup.sh

echo "→ Fijando versión $VERSION en .env"
sed -i -E "s#^(IMAGE_API=.*):.*#\1:$VERSION#" .env
sed -i -E "s#^(IMAGE_WEB=.*):.*#\1:$VERSION#" .env

echo "→ Descargando imágenes"
docker compose -f docker-compose.prod.yml --env-file .env pull

echo "→ Migrando y levantando"
docker compose -f docker-compose.prod.yml --env-file .env up -d

echo "→ Verificando contra el sitio publicado"
sleep 5
domain="$(grep -E '^DOMAIN=' .env | cut -d= -f2)"
curl -fsS "https://$domain/api/health" | tee /dev/stderr

echo
echo "Desplegado $VERSION. Rollback: ./deploy.sh <version-anterior>"
