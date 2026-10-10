-- TASK-025: como mucho UN intento de cobro abierto (pending/unknown/needs_review) por
-- suscripción. Hasta acá solo lo cuidaba el lock de la app; el índice único parcial lo
-- garantiza en la base.
--
-- Si ya hay suscripciones con más de un intento abierto, crear el índice fallaría con un
-- error genérico de duplicados. Se frena antes con un mensaje que dice qué revisar: los
-- intentos son registros de cobro y NO se borran ni se cierran en una migración. Resolverlos a
-- mano (docs/deployment.md, «Intentos de cobro abiertos duplicados») y volver a desplegar.
DO $$
DECLARE
  duplicated TEXT;
BEGIN
  SELECT string_agg(format('%s (%s abiertos)', "subscriptionId", open_count), ', ')
    INTO duplicated
    FROM (
      SELECT "subscriptionId", count(*) AS open_count
        FROM "payment_attempts"
       WHERE status IN ('pending', 'unknown', 'needs_review')
       GROUP BY "tenantId", "subscriptionId"
      HAVING count(*) > 1
    ) AS dup;
  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION 'payment_attempts: hay suscripciones con más de un intento de cobro abierto: %. Resolverlos a mano antes de migrar (docs/deployment.md, «Intentos de cobro abiertos duplicados»).', duplicated;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_one_open_per_subscription" ON "payment_attempts"("tenantId", "subscriptionId") WHERE (status = ANY (ARRAY['pending'::"PaymentAttemptStatus", 'unknown'::"PaymentAttemptStatus", 'needs_review'::"PaymentAttemptStatus"]));
