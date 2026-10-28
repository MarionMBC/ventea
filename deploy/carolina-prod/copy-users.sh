#!/usr/bin/env bash
# Copia de la base de pruebas a la base dedicada de Carolina SOLO las cuentas (TASK-027):
#   customers, staff_members y los asientos `signup_bonus` (cada cuenta conserva su bono).
# NO copia pedidos, líneas, asientos de pedido/canje, dispositivos ni media: son datos de prueba.
# El tenantId se remapea al del tenant nuevo (distinto: lo creó create-tenant en la base dedicada).
# Solo LEE de la base de pruebas. Aborta si la base nueva ya tiene clientes (no duplica).
#
#   cd ~/carolina-prod && ./copy-users.sh
set -euo pipefail

SLUG=${TENANT_SLUG:-carolina-hot-chicken}
OLD=ventea-test-postgres-1
NEW=carolina-prod-postgres-1

q() { # q <contenedor> [args psql...]  (SQL por stdin o -c)
  local c=$1; shift
  docker exec -i "$c" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At "$@"' sh "$@"
}

old_id=$(q "$OLD" -c "select id from tenants where slug='$SLUG'")
new_id=$(q "$NEW" -c "select id from tenants where slug='$SLUG'")
[ -n "$old_id" ] && [ -n "$new_id" ] || { echo "✗ tenant '$SLUG' no existe en alguna de las dos bases" >&2; exit 1; }
[ "$old_id" != "$new_id" ] || { echo "✗ mismo tenantId en ambas bases: ¿se apuntó al mismo Postgres?" >&2; exit 1; }
have=$(q "$NEW" -c "select count(*) from customers where \"tenantId\"='$new_id'")
[ "$have" = 0 ] || { echo "✗ la base nueva ya tiene $have clientes; no se copia encima" >&2; exit 1; }

copy() { # copy <tabla> <columnas sin tenantId> <where extra>
  local t=$1 cols=$2 where=${3:-true}
  local cols_q; cols_q=$(echo "$cols" | sed 's/[^,]*/"&"/g; s/, */, /g')
  q "$OLD" -c "COPY (select id, '$new_id' as \"tenantId\", $cols_q from $t where \"tenantId\"='$old_id' and $where) TO STDOUT" \
    | q "$NEW" -c "COPY $t (id, \"tenantId\", $cols_q) FROM STDIN"
}

copy customers 'email,phone,passwordHash,firstName,lastName,biometricEnabled,emailVerifiedAt,createdAt,updatedAt'
copy staff_members 'email,passwordHash,name,role,isActive,tokenVersion,createdAt'
# Los asientos llevan customerId (no id propio distinto): mismo patrón, solo el bono de registro.
copy reward_ledger_entries 'customerId,points,reason,note,createdAt' "reason='signup_bonus'"

for t in customers staff_members reward_ledger_entries; do
  echo "$t: origen=$(q "$OLD" -c "select count(*) from $t where \"tenantId\"='$old_id'") destino=$(q "$NEW" -c "select count(*) from $t where \"tenantId\"='$new_id'")"
done
