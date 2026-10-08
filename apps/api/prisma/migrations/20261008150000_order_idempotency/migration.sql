-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "idempotencyRequestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_customerId_idempotencyKey_key" ON "orders"("tenantId", "customerId", "idempotencyKey");
