-- TASK-005: cobro recurrente. Solo aditiva: columnas nullable en subscriptions, valores
-- nuevos de BillingEventType y la tabla payment_attempts (intentos de cobro write-ahead).
-- CreateEnum
CREATE TYPE "PaymentAttemptKind" AS ENUM ('establish', 'renewal');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('pending', 'succeeded', 'failed', 'unknown', 'failed_non_bank');

-- AlterEnum


ALTER TYPE "BillingEventType" ADD VALUE 'payment_succeeded';
ALTER TYPE "BillingEventType" ADD VALUE 'payment_failed';
ALTER TYPE "BillingEventType" ADD VALUE 'payment_unknown';
ALTER TYPE "BillingEventType" ADD VALUE 'payment_method_updated';
ALTER TYPE "BillingEventType" ADD VALUE 'plan_change_scheduled';
ALTER TYPE "BillingEventType" ADD VALUE 'cancel_scheduled';
ALTER TYPE "BillingEventType" ADD VALUE 'cancel_resumed';
ALTER TYPE "BillingEventType" ADD VALUE 'past_due';
ALTER TYPE "BillingEventType" ADD VALUE 'billing_alert';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "cardExpMonth" INTEGER,
ADD COLUMN     "cardExpYear" INTEGER,
ADD COLUMN     "pendingInterval" "BillingInterval",
ADD COLUMN     "pendingPlanId" TEXT,
ADD COLUMN     "retryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "PaymentAttemptKind" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'pending',
    "providerTransactionId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_orderId_key" ON "payment_attempts"("orderId");

-- CreateIndex
CREATE INDEX "payment_attempts_tenantId_subscriptionId_periodStart_idx" ON "payment_attempts"("tenantId", "subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts"("status");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

