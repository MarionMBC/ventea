-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "acceptsOrders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "maxStaff" INTEGER;

-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_password_resets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_invitations_tenantId_email_idx" ON "staff_invitations"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_tenantId_tokenHash_key" ON "staff_invitations"("tenantId", "tokenHash");

-- CreateIndex
CREATE INDEX "staff_password_resets_tenantId_staffId_idx" ON "staff_password_resets"("tenantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_password_resets_tenantId_tokenHash_key" ON "staff_password_resets"("tenantId", "tokenHash");

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_password_resets" ADD CONSTRAINT "staff_password_resets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_password_resets" ADD CONSTRAINT "staff_password_resets_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Datos (TASK-022): usuarios del panel por plan (activos + invitaciones pendientes).
-- Básico 3, Pro 10, Cadena ilimitados (NULL). Idempotente.
UPDATE "plans" SET "maxStaff" = 3 WHERE "code" = 'basic' AND "maxStaff" IS NULL;
UPDATE "plans" SET "maxStaff" = 10 WHERE "code" = 'pro' AND "maxStaff" IS NULL;
