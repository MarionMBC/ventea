-- TASK-023: catálogo de recompensas, auditoría de ajustes de puntos e índice de reportes.
-- Aditiva: tablas, columnas nulables e índice nuevos; la API anterior no los usa.

-- CreateEnum
CREATE TYPE "RewardCatalogKind" AS ENUM ('item', 'discount');

-- AlterTable
ALTER TABLE "reward_ledger_entries" ADD COLUMN     "rewardId" TEXT,
ADD COLUMN     "staffId" TEXT,
ADD COLUMN     "staffNote" TEXT;

-- CreateTable
CREATE TABLE "reward_catalog_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "kind" "RewardCatalogKind" NOT NULL,
    "menuItemId" TEXT,
    "discountCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_catalog_items_tenantId_isActive_sortOrder_idx" ON "reward_catalog_items"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "orders_tenantId_placedAt_idx" ON "orders"("tenantId", "placedAt");

-- AddForeignKey
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "reward_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reglas que el esquema de Prisma no expresa: costo positivo y el dato que pide cada tipo.
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_cost_check" CHECK ("pointsCost" > 0);
ALTER TABLE "reward_catalog_items" ADD CONSTRAINT "reward_catalog_items_kind_check" CHECK (
  ("kind" = 'discount' AND "discountCents" IS NOT NULL AND "discountCents" > 0)
  OR ("kind" = 'item' AND "discountCents" IS NULL)
);
