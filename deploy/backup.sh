#!/usr/bin/env bash
# Respaldo de la base de un cliente. Pensado para correr por cron en el VPS:
#
#   0 3 * * * /opt/ventea/backup.sh >> /var/log/ventea-backup.log 2>&1
#
# Un respaldo que nunca se restauró no es un respaldo. Probar la restauración
# en una base descartable antes de confiar en esto.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/ventea/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/ventea/docker-compose.prod.yml}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/ventea-$stamp.sql.gz"

# --clean deja el dump listo para restaurar sobre una base existente.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-ventea}" --clean --if-exists "${POSTGRES_DB:-ventea}" \
  | gzip > "$target"

# Verificar que el archivo no salió vacío: pg_dump puede fallar después de que
# gzip ya creó el archivo, y un .gz de 20 bytes se ve como un respaldo válido.
if [ ! -s "$target" ] || [ "$(stat -c%s "$target")" -lt 1024 ]; then
  echo "ERROR: respaldo sospechosamente chico: $target" >&2
  exit 1
fi

echo "OK: $target ($(du -h "$target" | cut -f1))"

find "$BACKUP_DIR" -name 'ventea-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
