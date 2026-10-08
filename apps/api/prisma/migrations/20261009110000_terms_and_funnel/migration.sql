-- TASK-007: solo aditiva. Términos aceptados en el registro (columnas nullable en tenants) y
-- contadores del embudo de la landing (tabla global, sin datos personales).

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "funnel_daily_counts" (
    "day" DATE NOT NULL,
    "event" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "funnel_daily_counts_pkey" PRIMARY KEY ("day","event")
);

