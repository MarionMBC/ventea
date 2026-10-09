-- TASK-023 (review): idempotencia de ajustes y canjes del panel. Columna nulable + único
-- (tenantId, idempotencyKey): los asientos existentes (NULL) no chocan entre sí.
ALTER TABLE "reward_ledger_entries" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "reward_ledger_entries_tenantId_idempotencyKey_key" ON "reward_ledger_entries"("tenantId", "idempotencyKey");
