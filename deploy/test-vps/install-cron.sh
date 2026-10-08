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
#
# Solo toca SU línea, reconocida por el comentario `# ventea-sync-routes`: el resto del
# crontab (otras entradas, comentarios, líneas en blanco) queda byte a byte igual.
# Que dos corridas no se pisen lo resuelve sync-routes.sh con flock.
set -euo pipefail

MARKER='# ventea-sync-routes'
LINE="* * * * * cd ~/ventea-test && ./sync-routes.sh --quiet >> sync-routes.log 2>&1 $MARKER"

current=$(crontab -l 2>/dev/null || true)
# Todo menos nuestra línea (sea cual sea su versión), sin tocar nada más.
others=$(printf '%s' "$current" | awk -v m="$MARKER" 'index($0, m) == 0')

write_crontab() {
  # $1 = contenido completo. Vacío → crontab vacío (no `crontab -r`: no borra el archivo).
  if [ -n "$1" ]; then printf '%s\n' "$1" | crontab -; else printf '' | crontab -; fi
}

case "${1:-}" in
  --remove)
    write_crontab "$others"
    echo "✓ cron de sync-routes quitado"
    exit 0
    ;;
  "") ;;
  *) echo "uso: $0 [--remove]" >&2; exit 2 ;;
esac

if printf '%s\n' "$current" | grep -qxF "$LINE"; then
  echo "= cron ya instalado:"
else
  if [ -n "$others" ]; then write_crontab "$others"$'\n'"$LINE"; else write_crontab "$LINE"; fi
  echo "✓ cron instalado:"
fi
crontab -l | grep -F "$MARKER"
