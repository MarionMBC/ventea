# Modelo de datos

Fuente de verdad: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
Este documento explica **por qué** el esquema es así, no repite los campos.

## Mapa

```
PlatformAdmin                        (fuera de todo tenant — nosotros)
Plan                                 (catálogo global: basic, pro, chain)
FunnelDailyCount                     (global: embudo de la landing, día × evento → contador)

Tenant ──┬── Subscription ── Plan    1:1  plan, intervalo, estado, período, prueba
         ├── BillingEvent[]               auditoría append-only de la suscripción
         ├── TenantBranding          1:1  colores, logo, ícono, nombre visible, datos de tienda, idioma
         ├── AppConfig               1:1  app nativa: bundleId, quién publica, estado, push cifrado
         ├── AppConfigEvent[]             historial de la app (solicitud, cambios, credenciales)
         ├── MediaAsset[]                 imágenes subidas (archivo en el volumen `media`)
         ├── MenuChange[]                 auditoría del menú (quién, qué, cuándo)
         ├── RewardProgram           1:1  reglas de puntos de la marca
         ├── Location[]                   sucursales
         ├── MenuCategory[] ── MenuItem[] ── MenuItemModifierGroup ── ModifierGroup ── ModifierOption[]
         ├── Customer[] ──┬── Device[]         push + biometría
         │                └── RewardLedgerEntry[]
         ├── StaffMember[]                usuarios del panel
         └── Order[] ── OrderLine[] ── OrderLineOption[]
```

Todo lo que cuelga de `Tenant` lleva `tenantId`. Ver [multi-tenancy.md](multi-tenancy.md).

## Decisiones que no se leen del esquema

### La suscripción es del tenant, la suspensión no toca `Tenant.isActive`

`Subscription` (1:1 con `Tenant`) guarda plan, intervalo (`month` | `year`), estado
(`trialing` | `active` | `past_due` | `suspended` | `canceled`), fin de la prueba y período.
Una marca `suspended`, `canceled` o con la prueba vencida responde `402` en su API pública,
pero existe: su staff entra al panel. `past_due` de un período pagado sigue atendiendo durante
la gracia (7 días desde `currentPeriodEnd`, TASK-007); una prueba vencida sin pago no tiene
gracia (`currentPeriodEnd <= trialEndsAt`). `Tenant.isActive=false` sigue siendo
"no existe" (404). Los campos de pago (`paymentToken`, `networkTransactionId`…) son para el
cobro recurrente de TASK-005 y hoy quedan en null.

`BillingEvent` es append-only como el libro de puntos: cada cambio de estado o de plan deja
un asiento. Su `orderId` es único y será la clave idempotente hacia `ms-payments`.

Los planes viven en la tabla `plans` y los siembra una migración SQL idempotente; cambiar un
precio es otra migración, así queda en el historial del repo.

### Términos aceptados en `Tenant`, no en `BillingEvent` (TASK-007)

`Tenant.termsVersion` y `Tenant.termsAcceptedAt` (nullable: las marcas creadas por script no
pasaron por el checkbox) guardan la versión de términos y privacidad que aceptó el dueño al
registrarse. No va como `BillingEvent`: no es un hecho de cobro, habría exigido sumar un valor
al enum y el estado vigente se lee sin recorrer eventos. Si mañana hay que pedir de nuevo la
aceptación (términos nuevos), se pisa con la versión nueva; un historial de aceptaciones sería
otra tabla.

### Embudo sin datos personales (TASK-007)

`funnel_daily_counts` solo tiene `(day, event, count)`: ni IP, ni navegador, ni ids. Se suma
con `INSERT … ON CONFLICT DO UPDATE` (atómico). Tabla global, exenta del guard de tenant.

### El dinero es `Int` en centavos

`basePriceCents`, `totalCents`, `priceDeltaCents`. Nunca `Float` ni `Decimal` con
aritmética en JS: `0.1 + 0.2 !== 0.3`, y un céntimo perdido por pedido es un descuadre
de caja al cierre. El formateo a texto ocurre solo en presentación
(`packages/shared/src/utils/money.ts`).

### `OrderLine` guarda snapshot, no solo la referencia

`nameSnapshot` y `unitPriceCents` se copian al confirmar el pedido. `menuItemId` queda
como referencia informativa, con `onDelete: SetNull`.

Sin snapshot, subir el precio de un producto reescribiría el total de los pedidos
pasados, y borrar un producto vaciaría boletas ya emitidas. El pedido es un hecho
histórico: una vez ocurrido, no cambia porque el menú cambie.

Lo mismo aplica a `OrderLineOption`.

### Los puntos son un libro contable, no un contador

`RewardLedgerEntry` es append-only. El saldo es `SUM(points)` filtrando por
`tenantId + customerId`. Positivo acredita, negativo debita, y cada asiento lleva
`reason` y opcionalmente el `orderId` que lo originó.

Un campo `Customer.points` mutable sería más rápido de leer y sin historia: ante un
reclamo de "me faltan puntos" no habría con qué responder, y un ajuste manual borraría
la evidencia. Si la suma se vuelve costosa, la salida es una tabla de saldos derivada
que se recalcula desde el libro — no reemplazarlo.

### `RewardProgram` es por tenant

Cada marca define sus puntos por unidad gastada, el valor de canje, el mínimo y el bono
de registro. Hardcodear "1 punto por cada $100" haría del programa de Carolina la regla
de todos los clientes futuros.

### Los modificadores son N:M

`MenuItemModifierGroup` existe porque un grupo como "Nivel de picante" o "Agregados" se
reutiliza en varios productos. Duplicarlo por producto obligaría a editar el mismo grupo
en veinte lugares cada vez que cambia un precio.

### Los medios: ruta en la base, archivo en el volumen (TASK-016)

`MediaAsset` registra cada imagen subida (hash sha256 del WebP normalizado, bytes, tamaño) y
sirve para la cuota y para verificar que un ítem o la marca solo usen imágenes propias. El
archivo vive en `MEDIA_DIR/<tenantId>/<hash>.webp`. `MenuItem.imageUrl`, `logoUrl` e `iconUrl`
guardan la **ruta** `/api/media/…`, nunca el host: el mismo archivo se sirve desde cualquier
dominio de la plataforma y las respuestas la vuelven absoluta.

### Borrado del menú: `deletedAt` solo cuando hay historia (TASK-016)

Un ítem con pedidos no se borra: se marca `deletedAt` y sale del menú, del panel y del alta de
pedidos. Los pedidos no lo necesitan (guardan snapshot), pero así el ítem sigue enlazado a su
historia para reportes. Sin pedidos se borra de verdad. La categoría hereda la regla por la FK
`Restrict` del ítem: si solo le quedan ítems borrados, también se marca.

### `AppConfig.bundleId` es único global (TASK-016)

Es la única excepción a «todo unique incluye `tenantId`»: el bundle id es un espacio de nombres
de Apple y Google, no un dato de la marca, y dos marcas con el mismo romperían la publicación.
Solo lo edita la plataforma. Las credenciales FCM se guardan cifradas (AES-256-GCM, el
`tenantId` como dato asociado): copiadas a otra marca no descifran.

### `Device` guarda `biometricKeyId`, no la huella

El secreto biométrico nunca sale del dispositivo ni llega al servidor. Lo que se guarda
es el identificador de la credencial; la huella o el rostro desbloquean el refresh token
almacenado en Keychain/Keystore. El backend solo ve el token que el dispositivo liberó.

El `pushToken` (TASK-016) es único por marca en la práctica (upsert por `tenantId + pushToken`
con lock): si otra cuenta inicia sesión en el mismo teléfono, el dispositivo pasa a ella.

### `Location` guarda coordenadas, no hay tracking

`latitude`/`longitude` sirven para ordenar sucursales por cercanía cuando el cliente
abre esa pantalla. No se persiste la posición del usuario en ningún lado — quedó
explícitamente fuera del alcance.

### `Customer.email` es único **por tenant**

La misma persona puede ser clienta de Carolina y de otra marca: son dos cuentas
distintas, con sus propios puntos e historial. Un unique global las fusionaría y haría
que un `findUnique` por email cruzara tenants.

### `Order.code` es único por tenant

Código corto que se canta en el mostrador. Dos marcas pueden tener el `A-042` el mismo
día sin colisionar.

## Convenciones

- **Claves**: `uuid()`. No autoincremental: un ID secuencial en una URL pública deja
  contar cuántos pedidos hace el negocio.
- **Nombres**: `camelCase` en Prisma, `snake_case` en Postgres vía `@@map`/`@map`.
- **Borrado**: `Cascade` desde `Tenant` (dar de baja una marca borra sus datos);
  `Restrict` donde borrar rompería historia (`MenuCategory`, `Location`);
  `SetNull` en referencias informativas de pedidos.
- **Fechas**: siempre UTC en la DB. El `timezone` del tenant se aplica al presentar.
