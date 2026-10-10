-- TASK-025: como mucho UN intento de cobro abierto (pending/unknown/needs_review) por
-- suscripción. Hasta acá solo lo cuidaba el lock de la app; el índice único parcial lo
-- garantiza en la base.
--
-- Si ya hay suscripciones con más de un intento abierto, crear el índice fallaría con un
-- error genérico de duplicados. Se frena antes con un mensaje que lista marca, suscripción y
-- orderId (lo que pide resolve-payment): los intentos son registros de cobro y NO se borran ni se
-- cierran en una migración. `deploy/check-open-payment-attempts.sh` (misma regla) lo detecta
-- antes del deploy; si igual se llega acá, docs/deployment.md «Intentos de cobro abiertos
-- duplicados» tiene la recuperación.
DO $$
DECLARE
  duplicated TEXT;
BEGIN
  SELECT string_agg(
           format('%s / suscripción %s: %s', slug, "subscriptionId", order_ids), '; '
         )
    INTO duplicated
    FROM (
      SELECT t.slug, a."subscriptionId",
             string_agg(a."orderId" || ' (' || a.status || ')', ', ' ORDER BY a."createdAt") AS order_ids
        FROM "payment_attempts" a
        JOIN "tenants" t ON t.id = a."tenantId"
       WHERE a.status IN ('pending', 'unknown', 'needs_review')
       GROUP BY t.slug, a."tenantId", a."subscriptionId"
      HAVING count(*) > 1
    ) AS dup;
  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION 'payment_attempts: hay suscripciones con más de un intento de cobro abierto: %. Cerrarlos con resolve-payment (orderId) antes de migrar; recuperación en docs/deployment.md, «Intentos de cobro abiertos duplicados».', duplicated;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_one_open_per_subscription" ON "payment_attempts"("tenantId", "subscriptionId") WHERE (status = ANY (ARRAY['pending'::"PaymentAttemptStatus", 'unknown'::"PaymentAttemptStatus", 'needs_review'::"PaymentAttemptStatus"]));
