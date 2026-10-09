-- TASK-023 (review): copia del nombre del staff en el asiento. Si la persona se borra,
-- `staffId` pasa a null (FK SetNull) pero la auditoría conserva quién fue.
ALTER TABLE "reward_ledger_entries" ADD COLUMN "staffName" TEXT;

-- Asientos del panel ya existentes: el nombre actual de su autor.
UPDATE "reward_ledger_entries" e
SET "staffName" = s."name"
FROM "staff_members" s
WHERE e."staffId" = s."id" AND e."staffName" IS NULL;
