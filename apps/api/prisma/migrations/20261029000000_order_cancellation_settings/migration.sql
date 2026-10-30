-- Cancelación del pedido por el cliente: interruptor y tiempo de gracia por marca.
ALTER TABLE "tenants"
  ADD COLUMN "customerCanCancel" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cancelWindowMinutes" INTEGER DEFAULT 5;
