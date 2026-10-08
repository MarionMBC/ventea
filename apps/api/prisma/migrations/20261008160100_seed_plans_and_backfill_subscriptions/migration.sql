-- Migración de DATOS (TASK-004, ADR 0007). Escrita a mano: `prisma migrate diff` solo
-- genera DDL. Idempotente: correrla dos veces no duplica nada.

-- 1 · Planes del SaaS (USD, anual = 10 meses). Fuente de verdad de precios: esta tabla.
--     Cambiar un precio es una migración nueva, nunca editar esta.
INSERT INTO "plans" ("id", "code", "name", "priceMonthlyCents", "priceYearlyCents", "currency", "maxLocations", "features", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'basic', 'Básico', 2500, 25000, 'USD', 1,
   '{"brandedApp": false, "customDomain": false, "reports": false, "prioritySupport": false}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'pro', 'Pro', 5900, 59000, 'USD', 3,
   '{"brandedApp": true, "customDomain": true, "reports": false, "prioritySupport": false}'::jsonb, true, now(), now()),
  (gen_random_uuid()::text, 'chain', 'Cadena', 12900, 129000, 'USD', NULL,
   '{"brandedApp": true, "customDomain": true, "reports": true, "prioritySupport": true}'::jsonb, true, now(), now())
ON CONFLICT ("code") DO NOTHING;

-- 2 · Tenants existentes: suscripción ACTIVE en plan Cadena anual, período de un año.
--     Sin esto el SubscriptionMiddleware no tendría estado que mirar; con esto, nada se
--     suspende al desplegar (carolina-hot-chicken, demo-burgers, pollos-prueba, taqueria-demo).
INSERT INTO "subscriptions" ("id", "tenantId", "planId", "interval", "status", "trialEndsAt", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", p."id", 'year', 'active', NULL, now(), now() + interval '1 year', false, now(), now()
FROM "tenants" t
CROSS JOIN "plans" p
WHERE p."code" = 'chain'
  AND NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."tenantId" = t."id");
