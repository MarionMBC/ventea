# API

Todas las rutas van bajo `/api` y pasan por `TenantMiddleware`: la marca sale del subdominio
(`<slug>.ventea.tech`) o del header `X-Tenant-Slug`, que es lo que usan las apps nativas.
`/api/health` es la única excepción. Los schemas de entrada y salida son los de `@ventea/shared`
(`packages/shared/src/contracts`): la API valida con ellos y las apps los usan como tipos.

## Autenticación

JWT HS256 firmado con `JWT_SECRET`. Cada token lleva:

- `tid`: la marca. Un token de una marca no sirve en otra.
- `typ`: `access` (15 min) o `refresh` (30 días).
- `kind`: `customer` o `staff`.

| Método      | Ruta                    | Quién                                                            |
| ----------- | ----------------------- | ---------------------------------------------------------------- |
| POST        | `/api/auth/register`    | público · acredita el bono de bienvenida                         |
| POST        | `/api/auth/login`       | público · el mismo 401 para email inexistente y clave incorrecta |
| POST        | `/api/auth/refresh`     | público · `{refreshToken}`, sirve para clientes y staff          |
| GET · PATCH | `/api/me`               | cliente                                                          |
| POST        | `/api/staff/auth/login` | público                                                          |

No hay revocación del lado del servidor: cerrar sesión es descartar los tokens. Ver
`.agent/decisions.md`.

## Catálogo (público)

| Método | Ruta                    |                                                                    |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/api/tenant`           | nombre, moneda, branding y programa de puntos                      |
| GET    | `/api/locations`        | sucursales activas                                                 |
| GET    | `/api/menu?locationId=` | menú publicado. Incluye los ítems agotados con `isAvailable=false` |

## Pedidos

| Método | Ruta                              | Quién                                                        |
| ------ | --------------------------------- | ------------------------------------------------------------ |
| POST   | `/api/orders`                     | cliente                                                      |
| GET    | `/api/orders` · `/api/orders/:id` | cliente · solo los propios                                   |
| POST   | `/api/orders/:id/cancel`          | cliente · solo en `confirmed`                                |
| GET    | `/api/staff/orders?status=`       | staff                                                        |
| PATCH  | `/api/staff/orders/:id/status`    | staff · `confirmed→preparing→ready→completed`, o `cancelled` |

- **El cliente nunca manda precios.** La API recalcula cada línea desde el catálogo:
  `(base + deltas de las opciones) × cantidad`. También valida los mínimos y máximos de
  cada grupo de modificadores y la disponibilidad.
- **Estado inicial y pago:** el pedido nace `confirmed` con pago `pending`, porque se paga al
  retirar. Pasa a `paid` al completarse.
- **Solo `pickup` y `dine_in`:** `delivery` responde 400 porque no hay direcciones.

## Puntos

| Método | Ruta                   |                                      |
| ------ | ---------------------- | ------------------------------------ |
| GET    | `/api/rewards/balance` | saldo y total ganado                 |
| GET    | `/api/rewards/ledger`  | movimientos, el más reciente primero |

Los puntos son un libro contable: cada movimiento es un asiento y el saldo es su suma.

- **Canje:** se debita al crear el pedido, en la misma transacción y con la fila del cliente
  bloqueada, así que dos pedidos simultáneos no pueden dejar el saldo negativo.
- **Acreditación:** al pasar a `completed`, una sola vez por pedido.
- **Cancelación:** devuelve lo canjeado.

Valores por defecto del programa (`DEFAULT_REWARD_PROGRAM`), en unidades menores:

- 1 punto por unidad de moneda gastada;
- 1 punto = 1 centavo al canjear;
- canje desde 100 puntos;
- bono de bienvenida de 50 puntos.

## Scripts de operación

```bash
# Alta de marca (dueño con contraseña aleatoria, se muestra una vez)
node apps/api/dist/scripts/create-tenant.js --slug <slug> --name "<nombre>" --owner-email <email>

# Reemplazar el menú de una marca desde un JSON. Corre en una transacción; los
# pedidos existentes no se tocan. Cambiar la moneda de una marca que ya tiene
# pedidos exige --force-currency.
node apps/api/dist/scripts/import-menu.js --tenant <slug> --file apps/api/prisma/data/carolina-menu.json
```
