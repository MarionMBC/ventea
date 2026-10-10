#!/usr/bin/env bash
# Pre-chequeo de SOLO LECTURA antes de desplegar (TASK-025): suscripciones con más de un intento
# de cobro abierto (pending / unknown / needs_review). La migración
# 20261010130000_one_open_payment_attempt crea un índice único que lo prohíbe y aborta si los hay;
# abortada, Prisma la deja `failed` y NINGÚN `migrate deploy` (ni el de la versión anterior)
# vuelve a correr hasta resolverla: la API no levanta. Este chequeo lo detecta ANTES, sin tocar
# nada: lista marca, suscripción y `orderId` (lo que pide `resolve-payment`) y sale con 1.
#
#   ./check-open-payment-attempts.sh                       # /opt/ventea (docker-compose.prod.yml)
#   COMPOSE_FILE=docker-compose.yml ./check-open-payment-attempts.sh   # VPS de prueba
#
# `PSQL` reemplaza el comando de psql (tests: `PSQL="psql postgresql://…"`). Sin la tabla
# (instalación nueva) o sin Postgres corriendo (primer deploy) no hay nada que chequear.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"

if [ -z "${PSQL:-}" ]; then
  env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2-; }
  compose=(docker compose -f "$COMPOSE_FILE")
  [ -f "$ENV_FILE" ] && compose+=(--env-file "$ENV_FILE")
  if [ -z "$("${compose[@]}" ps --status running -q postgres 2>/dev/null)" ]; then
    echo "· Pre-chequeo de cobros: Postgres no está corriendo (instalación nueva), nada que revisar"
    exit 0
  fi
  user="$(env_value POSTGRES_USER)"
  db="$(env_value POSTGRES_DB)"
  PSQL="${compose[*]} exec -T postgres psql -U ${user:-ventea} -d ${db:-ventea}"
fi

run_sql() {
  # shellcheck disable=SC2086 # PSQL es un comando con argumentos.
  $PSQL -v ON_ERROR_STOP=1 -X -q -At -F ' | ' -c "$1"
}

if [ "$(run_sql "SELECT to_regclass('public.payment_attempts') IS NOT NULL")" != "t" ]; then
  echo "· Pre-chequeo de cobros: sin tabla payment_attempts todavía, nada que revisar"
  exit 0
fi

# >>> open-attempt-duplicates.sql (la misma regla que el bloque DO de la migración; test e2e)
read -r -d '' DUPLICATES_SQL <<'SQL' || true
SELECT t.slug, a."tenantId", a."subscriptionId", a."orderId", a.status, a."createdAt"
  FROM payment_attempts a
  JOIN tenants t ON t.id = a."tenantId"
 WHERE a.status IN ('pending', 'unknown', 'needs_review')
   AND (a."tenantId", a."subscriptionId") IN (
     SELECT "tenantId", "subscriptionId"
       FROM payment_attempts
      WHERE status IN ('pending', 'unknown', 'needs_review')
      GROUP BY "tenantId", "subscriptionId"
     HAVING count(*) > 1
   )
 ORDER BY t.slug, a."subscriptionId", a."createdAt"
SQL
# <<< open-attempt-duplicates.sql

rows="$(run_sql "$DUPLICATES_SQL")"
if [ -z "$rows" ]; then
  echo "✓ Pre-chequeo de cobros: ninguna suscripción con más de un intento abierto"
  exit 0
fi

cat >&2 <<EOF
✗ Hay suscripciones con más de un intento de cobro abierto. NO se desplegó nada.
  marca | tenantId | suscripción | orderId | estado | creado
$rows

Para cada suscripción: conciliar con la pasarela cuál se cobró y cerrar los demás con
resolve-payment (uno por orderId), con la versión actual todavía arriba. Después, volver a
desplegar. Pasos en docs/deployment.md, «Intentos de cobro abiertos duplicados».
EOF
exit 1
