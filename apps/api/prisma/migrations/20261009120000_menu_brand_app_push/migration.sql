-- TASK-016: medios, auditoría del menú, soft-delete, marca ampliada, app por marca y push.
-- Aditiva: solo tablas, columnas nullable o con default, e índices nuevos.
-- CreateEnum
CREATE TYPE "AppPublisher" AS ENUM ('ventea', 'client');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('not_requested', 'requested', 'building', 'in_review', 'published');

-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_branding" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "iconUrl" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'es',
ADD COLUMN     "storeShortDescription" TEXT,
ADD COLUMN     "supportEmail" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_changes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_configs" (
    "tenantId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "publisher" "AppPublisher" NOT NULL,
    "status" "AppStatus" NOT NULL DEFAULT 'not_requested',
    "version" TEXT,
    "buildNumber" INTEGER,
    "storeUrlAndroid" TEXT,
    "storeUrlIos" TEXT,
    "requestedAt" TIMESTAMP(3),
    "pushCredentialsEnc" TEXT,
    "pushProjectId" TEXT,
    "pushUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "app_config_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_config_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_tenantId_hash_key" ON "media_assets"("tenantId", "hash");

-- CreateIndex
CREATE INDEX "menu_changes_tenantId_createdAt_idx" ON "menu_changes"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_configs_bundleId_key" ON "app_configs"("bundleId");

-- CreateIndex
CREATE INDEX "app_configs_status_idx" ON "app_configs"("status");

-- CreateIndex
CREATE INDEX "app_config_events_tenantId_createdAt_idx" ON "app_config_events"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "devices_tenantId_pushToken_idx" ON "devices"("tenantId", "pushToken");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_changes" ADD CONSTRAINT "menu_changes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_configs" ADD CONSTRAINT "app_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_config_events" ADD CONSTRAINT "app_config_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

