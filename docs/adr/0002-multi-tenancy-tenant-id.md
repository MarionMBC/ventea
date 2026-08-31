# 0002 — Aislamiento por `tenantId`, no por schema ni por base

**Estado**: aceptada · 2026-08-31

## Contexto

El producto se construye para Carolina Hot Chicken pero se vende a cualquier marca de
comida. Los datos de distintos clientes no pueden mezclarse jamás, y el costo de sumar
un cliente debe tender a cero: si cada alta exige aprovisionar infraestructura, el
modelo de negocio no cierra.

## Decisión

Una base de datos, una columna `tenantId` en toda tabla de negocio, y todo índice único
del negocio incluyéndola.

Tres capas de defensa (detalle en `docs/multi-tenancy.md`):

1. `TenantMiddleware` resuelve el tenant por subdominio o header — nunca por body ni query
2. Cada servicio filtra explícitamente por `tenantId`
3. Un middleware de Prisma verifica que el filtro exista; en desarrollo lanza excepción

## Alternativas descartadas

- **Schema por tenant**: aislamiento más fuerte, pero cada migración corre N veces y hay
  que gestionar N schemas. Prisma no lo soporta bien con un solo cliente generado.
- **Base por tenant**: aislamiento total y costo de infraestructura por cliente. Solo se
  justifica ante un requisito de cumplimiento normativo.

## Consecuencias

- El aislamiento depende de la disciplina en el código. Por eso el guard de Prisma y los
  tests con dos tenants: la semilla crea `demo-burgers` además de Carolina justamente
  para que un test de aislamiento pueda fallar.
- Migrar a RLS de Postgres está previsto antes de tener varios clientes con datos
  reales; el esquema ya es compatible.
- Un tenant con volumen desproporcionado afecta a los demás. Si pasa, se lo separa a su
  propia base — el modelo lo permite sin rediseñar.
