# 0005 — Guard de tenant como extensión de cliente Prisma

**Estado**: aceptada · 2026-08-31

## Contexto

El aislamiento entre tenants depende de que cada consulta lleve `tenantId` en su `where`
(ver ADR 0002). Hacía falta una red de seguridad que detectara el olvido, porque el
síntoma de un `where` incompleto es servir los datos de una marca a otra — sin error,
sin excepción, sin nada que avise.

La implementación natural era `PrismaClient.$use()`, el API de middleware. Prisma 7 lo
eliminó.

## Decisión

El guard se implementa con `$extends({ query: { $allModels: { $allOperations } } })` en
`apps/api/src/prisma/prisma.client.ts`.

Como `$extends` **devuelve un cliente nuevo** en vez de mutar el existente, el cliente se
provee por fábrica bajo el token `PRISMA` en lugar de una clase `PrismaService` que
extienda `PrismaClient`: una subclase no puede llevar la extensión consigo, y los
servicios terminarían inyectando un cliente sin guard sin notarlo.

Prisma 7 además sacó la URL de conexión del `schema.prisma`: vive en `prisma.config.ts`
para Migrate, y el cliente la recibe vía `PrismaPg` (driver adapter).

## Consecuencias

- Los servicios inyectan `@Inject(PRISMA) prisma: PrismaClientExtended`, no una clase.
- La semilla usa el cliente crudo a propósito: es el único lugar que legítimamente crea
  filas antes de que exista un tenant al cual filtrar.
- El callback de `$allOperations` va tipado como `any` con la regla de lint desactivada
  en esa línea: el tipo genérico de la extensión no se puede expresar sin volver
  ilegible el archivo, y el cuerpo solo lee `model`, `operation` y `args.where`.
- Esto es transitorio. Cuando se active RLS de Postgres (ADR 0002), el motor deja de
  confiar en que la aplicación se acuerde y el guard queda como aviso de desarrollo.
