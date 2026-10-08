# Ventea

Plataforma SaaS multi-tenant de pedidos para restaurantes: menú público, carrito,
checkout, cuenta de cliente, historial de pedidos, programa de puntos, sucursales
y panel administrativo.

**Primer cliente: Carolina Hot Chicken.** El producto no está construido _para_
Carolina — Carolina es el tenant `carolina-hot-chicken`, el primero de muchos. Nada
de lo que se escriba acá puede asumir una sola marca: ese es el activo que se revende.

## Modelo de despliegue

**Cada cliente corre su propia instancia en su VPS u hosting**: base de datos, API y
front completos, con su dominio y su certificado. No hay una nube central de Ventea.

La API arranca en `TENANT_MODE=single` con el slug fijado por configuración; el modo
`multi` (tenant por subdominio) queda para desarrollo y para alojar clientes chicos
juntos si conviene. Ver [docs/deployment.md](docs/deployment.md).

## Estructura

```
deploy/    Dockerfiles, compose de producción, Caddy y scripts de operación
apps/
  api/       NestJS + Prisma + PostgreSQL — API multi-tenant
  mobile/    Ionic React + Capacitor — app de cliente (iOS, Android, web)
  admin/     React + Vite — panel de gestión del tenant (desktop)
packages/
  shared/         contratos zod + vocabulario de dominio, compartidos por los tres
  tsconfig/       configuraciones base de TypeScript
  eslint-config/  reglas de lint compartidas
docs/           arquitectura, multi-tenancy, decisiones (ADR)
```

## Arranque

Requisitos: Node 22+, npm 10+, Docker.

```bash
cp .env.example .env          # completar JWT_SECRET
npm install
npm run db:up                 # PostgreSQL en Docker
npm run db:migrate            # crea el esquema
npm run db:seed               # 2 tenants de prueba (ver nota abajo)
npm run dev                   # api :3000 · mobile :5173 · admin :5174
```

La semilla crea **dos** tenants a propósito: `carolina-hot-chicken` y `demo-burgers`.
Con un solo tenant en la base, un bug de aislamiento es invisible.

npm 11 bloquea los scripts de instalación y avisa de siete paquetes pendientes
(`prisma`, `@prisma/engines`, `argon2`, `esbuild` y otros). **El aviso se puede ignorar**:
todos resuelven binarios precompilados en tiempo de ejecución — verificado con `prisma
generate`, `argon2.hash()` y el build de las tres apps. Si alguna vez falla un binario
nativo, ahí sí `npm approve-scripts <paquete>`, revisando cuál se aprueba.

### App nativa

```bash
npm run build -w @ventea/mobile
npx cap add android   # o ios — una sola vez
npm run cap:sync -w @ventea/mobile
npm run cap:android -w @ventea/mobile
```

Capacidades nativas en uso: biometría (desbloqueo de sesión), push, geolocalización
puntual (ordenar sucursales por cercanía — **no** hay tracking continuo) y cámara.
Todas pasan por la fachada `apps/mobile/src/lib/native/`; las features nunca importan
`@capacitor/*` directo.

## La regla que no se negocia

Toda tabla de negocio lleva `tenantId`, y toda consulta filtra por él. No es estilo:
un `where` sin `tenantId` muestra los pedidos de una marca a otra. El cliente Prisma
lleva un guard (`apps/api/src/prisma/prisma.client.ts`) que revienta en desarrollo
cuando falta.

Detalle completo en [docs/multi-tenancy.md](docs/multi-tenancy.md).

## Documentación

| Documento                                      | Qué responde                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)   | Cómo encajan las tres apps y por dónde va un request                        |
| [docs/multi-tenancy.md](docs/multi-tenancy.md) | Aislamiento entre marcas, resolución de tenant, camino a RLS                |
| [docs/api.md](docs/api.md)                     | Endpoints, autenticación, reglas de pedidos y puntos, scripts de operación  |
| [docs/data-model.md](docs/data-model.md)       | Entidades, por qué hay snapshots y por qué los puntos son un libro contable |
| [docs/white-label.md](docs/white-label.md)     | Cómo se produce una app con la marca de cada cliente                        |
| [docs/deployment.md](docs/deployment.md)       | Cómo se instala y se actualiza la instancia de un cliente en su VPS         |
| [docs/adr/](docs/adr/)                         | Decisiones tomadas y qué se descartó                                        |

## Estado

Esqueleto: estructura, configuración, modelo de datos, contratos compartidos y CI.
Sin features implementadas todavía — los directorios `features/` y `modules/` están
vacíos a propósito, con la nomenclatura ya fijada.

Verificado en local: `lint`, `typecheck`, `test` y `build` pasan en los cuatro paquetes,
y `prisma validate` acepta el esquema.

**Falta la migración inicial.** Requiere Postgres corriendo, y no se pudo levantar el
contenedor al armar el repo. Con Docker arriba:

```bash
npm run db:up
npm run db:migrate -- --name init    # crea prisma/migrations/<ts>_init
npm run db:seed
```

Hasta que ese directorio tenga la migración, el paso `prisma migrate deploy` del CI
corre en vacío y la base queda sin tablas.

También falta el script de alta de tenant (`create-tenant`) y el workflow que publique
las imágenes `ventea-api` y `ventea-web` en un registry.

### Decisiones abiertas

- **Pagos**: proveedor sin elegir (el modelo ya tiene `paymentStatus`)
- **Imágenes del catálogo**: dónde viven los archivos
- **Facturación**: cómo se le cobra a cada cliente (licencia, soporte, o ambos)
- **Publicación en tiendas**: cuenta propia o del cliente (ver `docs/white-label.md`)
- **Quién administra el VPS**: nosotros o el cliente. Define quién aplica los parches
  del sistema operativo y quién responde cuando el servidor se cae.
