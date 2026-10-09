# Ventea

Plataforma SaaS multi-tenant de pedidos para restaurantes: menú público, carrito,
checkout, cuenta de cliente, historial de pedidos, programa de puntos, sucursales
y panel administrativo.

**Primer cliente: Carolina Hot Chicken.** El producto no está construido _para_
Carolina — Carolina es el tenant `carolina-hot-chicken`, el primero de muchos. Nada
de lo que se escriba acá puede asumir una sola marca: ese es el activo que se revende.

## Modelo de negocio y despliegue

**SaaS por suscripción, alojado por nosotros** ([ADR 0007](docs/adr/0007-saas-multi-tenant.md)):
cada marca paga un plan (Básico $25, Pro $59, Cadena $129 al mes, en USD) y vive en
`<slug>.ventea.tech`. Una instancia atiende a todas las marcas en `TENANT_MODE=multi`; la
región se asigna sola según el país del registro (hoy una sola, `hn-1`).

`TENANT_MODE=single` queda para instalaciones dedicadas excepcionales. Ver
[docs/deployment.md](docs/deployment.md).

## Estructura

```
deploy/    Dockerfiles, compose de producción, Caddy y scripts de operación
apps/
  api/       NestJS + Prisma + PostgreSQL — API multi-tenant
  mobile/    Ionic React + Capacitor — app de cliente (iOS, Android, web)
  admin/     React + Vite — panel de gestión del tenant (desktop; /admin/facturacion para el
             dueño) y, en /admin/plataforma, el panel de la plataforma (marcas, cobros)
  landing/   React + Vite — app.ventea.tech: landing del SaaS de restaurantes, registro y legales
  site/      React + Vite — ventea.tech (www redirige): sitio corporativo en inglés (software y
             arquitectura), estático, contacto por mailto a hola@ventea.tech
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
npm run dev                   # api :3000 · mobile :5173 · admin :5174 · landing :5175 · site :5176
```

Landing y registro: `http://localhost:5175` (y `/registro`); el panel de plataforma:
`http://localhost:5174/admin/plataforma` (admin creado con `create-platform-admin`, ver
`docs/api.md`). Ambos llaman a `/api` del mismo origen y Vite lo manda a
`API_PROXY_TARGET` (por defecto `http://localhost:3000`).

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
| [docs/deployment.md](docs/deployment.md)       | Cómo se despliega y actualiza la plataforma (y una instalación dedicada)    |
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
- **Cobro de la suscripción**: el modelo de planes y suscripciones ya existe; el cobro
  recurrente con `ms-payments` es TASK-005
- **Publicación en tiendas**: cuenta propia o del cliente (ver `docs/white-label.md`)
- **Dominio propio y app con marca (plan Pro)**: hoy solo son `features` del plan
