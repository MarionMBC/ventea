# 0004 — API propia con NestJS + Prisma

**Estado**: aceptada · 2026-08-31

## Contexto

Hacía falta un backend con autenticación, aislamiento por tenant y lógica de pedidos.
Se evaluó usar un backend-as-a-service (Supabase, Firebase) para evitar mantener infra.

## Decisión

API propia en NestJS con Prisma sobre PostgreSQL.

## Alternativas descartadas

- **Supabase**: RLS de Postgres daría aislamiento por tenant a nivel motor, que es mejor
  que el nuestro. Pero la lógica de pedidos no es CRUD: recalcular el total desde el
  catálogo, aplicar el programa de puntos y asentar el libro contable tienen que ocurrir
  en una transacción del servidor. En un BaaS eso termina en Edge Functions, y ahí ya es
  un backend propio con menos control.
- **Firebase**: el aislamiento por tenant queda en security rules escritas a mano, sin
  transacciones relacionales, y los reportes agregados del panel obligan a duplicar datos.

## Consecuencias

- Hay que operar y desplegar un servicio y una base. No es gratis.
- El middleware de tenant, los guards y las validaciones son código nuestro: el
  aislamiento es responsabilidad de la aplicación hasta que se active RLS (ver 0002).
- Las reglas de negocio quedan del lado del servidor, donde el cliente no las negocia.
