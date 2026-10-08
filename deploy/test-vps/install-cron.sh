#!/usr/bin/env bash
# Instala (idempotente) el cron que mantiene las rutas de Traefik al día: cada minuto
# corre `sync-routes.sh --quiet`, que solo reescribe el archivo de Traefik si cambió.
# Así una marca registrada sola (POST /api/platform/signup) queda con certificado en
# <= 2 min, sin reiniciar Traefik (TASK-004).
#
#   ./install-cron.sh            instala o deja como está (correr las veces que sea)
#   ./install-cron.sh --remove   lo quita
#
# Va en el crontab del usuario que corre la instancia (henry, grupo docker), no en el
# de root: sync-routes.sh no necesita más permisos que esos.
set -euo pipefail

LINE='* * * * * cd ~/ventea-test && ./sync-routes.sh --quiet >> sync-routes.log 2>&1'
# Toda línea que corra sync-routes.sh se considera nuestra: una versión vieja de la
# línea se reemplaza en vez de duplicarse.
MATCH='ventea-test && ./sync-routes.sh'

current=$(crontab -l 2>/dev/null || true)
others=$(printf '%s\n' "$current" | grep -vF "$MATCH" | sed '/^$/d' || true)

case "${1:-}" in
  --remove)
    printf '%s\n' "$others" | sed '/^$/d' | crontab -
    echo "✓ cron de sync-routes quitado"
    exit 0
    ;;
  "") ;;
  *) echo "uso: $0 [--remove]" >&2; exit 2 ;;
esac

if printf '%s\n' "$current" | grep -qxF "$LINE"; then
  echo "= cron ya instalado:"
else
  { [ -n "$others" ] && printf '%s\n' "$others"; printf '%s\n' "$LINE"; } | crontab -
  echo "✓ cron instalado:"
fi
crontab -l | grep -F "$MATCH"
