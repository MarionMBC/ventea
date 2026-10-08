# Arquitectura

> **Despliegue**: SaaS alojado por nosotros ([ADR 0007](adr/0007-saas-multi-tenant.md)).
> Una instancia en modo `multi` atiende a todas las marcas, cada una en
> `<slug>.ventea.tech`; ver [deployment.md](deployment.md).

## Piezas

```
┌──────────────────┐   ┌──────────────────┐
│  apps/mobile     │   │  apps/admin      │
│  Ionic React     │   │  React + Vite    │
│  + Capacitor     │   │  (desktop)       │
│  cliente final   │   │  staff del local │
└────────┬─────────┘   └────────┬─────────┘
         │  Bearer JWT          │  Bearer JWT
         │  (+ X-Tenant-Slug    │  (+ subdominio en
         │   en modo multi)     │   modo multi)
         └──────────┬───────────┘
                    ▼
         ┌──────────────────────┐
         │  apps/api  (NestJS)  │
         │  TenantMiddleware    │  ← resuelve tenant ANTES de todo
         │  Guards de rol       │
         │  Servicios           │
         │  cliente Prisma      │  ← guard de tenantId ($extends)
         └──────────┬───────────┘
                    ▼
            ┌───────────────┐
            │  PostgreSQL   │  una DB, tenantId por fila
            └───────────────┘

         packages/shared  ← contratos zod y enums, usados por los tres
```

## Por dónde va un request

1. **TenantMiddleware** resuelve el tenant y lo deja en el request. En producción
   (`TENANT_MODE=multi`) sale del subdominio o del header; en una instalación dedicada
   (`single`), de la configuración. Sin tenant, 404 — no llega a ningún controlador.
   En la misma consulta trae el estado de la suscripción.
2. **SubscriptionMiddleware** corta con `402 Servicio suspendido` las rutas públicas de
   una marca suspendida, cancelada o con la prueba vencida. Siguen abiertas las rutas de
   staff (`/api/staff/*`), `/api/tenant` y `/api/auth/refresh` (el dueño entra a pagar), y
   `GET /api/orders[/:id]` y `GET /api/me` (el cliente ve sus pedidos en curso).
3. **Guard de autenticación** valida el JWT. El token incluye el `tenantId`: si no
   coincide con el tenant resuelto, se rechaza. Un token robado de otra marca no sirve.
4. **Guard de rol** para rutas de staff (`owner` / `manager` / `staff`).
5. **Controlador** valida el body con el schema zod de `packages/shared`.
6. **Servicio** consulta con `tenantId` explícito en el `where`.
7. La **extensión del cliente Prisma** verifica que ese filtro exista.

Las rutas `/api/platform/*` (registro, planes y administración de la plataforma) no pasan
por los middlewares de tenant: cruzan marcas por definición. Las de administración exigen
un JWT `kind: "platform"` (`PlatformAdmin`), que no sirve en rutas de marca ni al revés.

## Por qué tres apps y no una

**Móvil separada del panel** porque el cliente final y el encargado del local no
comparten ni pantallas ni dispositivo: gestionar un menú de 80 productos, cruzar
reportes y editar horarios se hace en desktop con tablas y teclado. Meter todo eso en
la app del cliente le agrega peso de bundle que nunca ejecuta, y obliga a resolver
permisos de rol en una app pública.

**Móvil con Ionic + Capacitor** porque las capacidades pedidas —biometría, push,
ubicación, cámara— exigen APIs nativas, y Capacitor da una sola base de código para
iOS y Android sin renunciar a ellas.

**API propia con NestJS** porque la lógica de pedidos no es CRUD: recalcular el total
desde el catálogo, aplicar el programa de puntos y asentar el libro contable tienen que
pasar en una transacción del servidor. Un backend-as-a-service dejaría esas reglas
del lado del cliente, donde son negociables.

## Reglas que cruzan todo el código

**El cliente nunca manda precios.** `createOrderSchema` recibe ítems y cantidades; la
API recalcula el total leyendo el catálogo del tenant. Aceptar un total del cliente es
aceptar que cualquiera compre a $1.

**El dinero es entero, en centavos.** Nunca float. Ver `packages/shared/src/utils/money.ts`.

**Los pedidos guardan snapshot.** `OrderLine` copia nombre y precio al momento de la
compra. El menú cambia; un pedido de hace tres meses y su boleta, no.

**Los puntos son un libro contable append-only.** El saldo es `SUM(points)`, no un
contador editable. Toda variación queda con causa (`reason`) y es auditable.

**Las features nunca importan `@capacitor/*` directo.** Pasan por
`apps/mobile/src/lib/native/`, porque la app también corre en navegador, donde varios
plugins no existen.

## Qué falta definir

- **Pagos**: proveedor sin elegir. El modelo ya tiene `paymentStatus`; falta la
  integración y el webhook de confirmación.
- **Almacenamiento de imágenes**: el catálogo guarda `imageUrl`; falta decidir dónde
  viven los archivos.
- **Cobro de la suscripción**: planes, suscripciones y `BillingEvent` ya existen; el
  cobro recurrente vía `ms-payments` (CyberSource para cobros sin CVV) es TASK-005.
- **Delivery**: el enum `fulfillmentType` lo contempla, pero no hay logística ni
  repartidores — quedó fuera del alcance acordado.
