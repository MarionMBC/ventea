# Marca blanca

Cómo el mismo código llega a la tienda de aplicaciones con la cara de cada cliente.

## Web: una instancia, un subdominio por marca

El menú público y el panel se sirven desde nuestra plataforma, en `<slug>.ventea.tech`
(ver [ADR 0007](adr/0007-saas-multi-tenant.md) y [deployment.md](deployment.md)). El
branding (`TenantBranding`) llega en la respuesta de la API y se aplica como variables CSS
en tiempo de ejecución, así que la misma imagen de contenedor se ve distinta por marca:

```
carolina-hot-chicken.ventea.tech  →  rojo, logo de Carolina
otra-marca.ventea.tech            →  azul, logo de la otra marca
```

Cliente nuevo = registro self-service (`POST /api/platform/signup`) o `create-tenant`: un
`INSERT` del tenant y el subdominio queda publicado por el cron de rutas. El dominio propio
(`pedidos.carolinahotchicken.cl`) es una feature del plan Pro, todavía sin implementar.

## Nativo: un binario por marca

Acá no hay atajo. Las tiendas exigen un bundle id propio, y el ícono y el nombre se
compilan dentro del artefacto. La app es **una plantilla** (`apps/mobile`, nacida de la
app de Carolina en TASK-018) y cada marca sale de ella con un archivo de configuración.

### Qué se fija al compilar y qué cambia sin publicar

| Qué                               | Fuente                                                              | ¿Cambia sin publicar? |
| --------------------------------- | ------------------------------------------------------------------- | --------------------- |
| `appId` / bundle id               | `brand.config.json` → `bundleId` (plantilla: `app.ventea.template`) | No                    |
| Nombre bajo el ícono              | `brand.config.json` → `appName`                                     | No                    |
| Tenant                            | nativo: `brand.config.json` → `tenantSlug`; web: el subdominio      | No                    |
| API                               | nativo: `brand.config.json` → `apiUrl`; web: mismo origen `/api`    | No                    |
| Ícono y splash                    | assets nativos, los genera TASK-019                                 | No                    |
| Push (Firebase)                   | `push.enabled` + `google-services.json` / plist de la marca         | No                    |
| Nombre en la app, colores, logo   | `GET /api/tenant` (con los del archivo como arranque)               | **Sí**                |
| Moneda y programa de puntos       | `GET /api/tenant`                                                   | **Sí**                |
| Menú, fotos (`imageUrl`), precios | `GET /api/menu`                                                     | **Sí**                |

**Web** (`<slug>.ventea.tech`, imagen nginx): el mismo build sirve a todas las marcas. La
marca sale del hostname (apex, `app.`, `www.`, `api.` u otro host → aviso «restaurante no
encontrado», sin llamadas) y la API es el mismo origen, así que `brand.config.json` no
decide nada ahí y `?tenant=` no existe en producción. **Nativo**: manda `brand.config.json`.

`brand.config.json` lo escribirá el generador (TASK-019) desde
`GET /api/platform/tenants/:slug/app/build-config`. Lo leen `vite.config.ts` (lo valida y lo
inyecta como `__BRAND__`) y `capacitor.config.ts` (`appId`, `appName`), así que un mismo
`cap sync` nunca mezcla dos marcas. Ejemplos para desarrollo: `apps/mobile/brands/`.

```bash
# web + nativo con otra marca, sin tocar brand.config.json
VENTEA_BRAND_FILE=brands/brand.carolina.json npm run build -w @ventea/mobile
cd apps/mobile && VENTEA_BRAND_FILE=brands/brand.carolina.json npx cap sync android
cd android && ./gradlew assembleDebug        # JDK 21 + ANDROID_HOME
```

### Tema: contraste AA calculado

Las superficies de la plantilla son neutras y oscuras; la marca va en acciones,
selección, badges y acentos. `src/brand/theme.ts` deriva todas las variables CSS de los
colores de la marca. En superficies rellenas (botones, badges) el color se oscurece en
pasos de 2 % hasta que el texto blanco pase 4.5:1 (#E23B2E → #D9392C); si hiciera falta más
de 20 % la marca cambiaría, y entonces va texto oscuro sobre el color original. Además: el
texto **sobre** el color (blanco, tinta o negro, el que pase 4.5:1)
y el color usado **como** texto (aclarado lo justo para 4.5:1 sobre las superficies).
Hover y pressed se alejan del color del texto, así que tampoco bajan de AA. Un secundario
casi negro (el default `#1F1D1B`) no sirve de acento sobre fondo oscuro: entonces el acento
es `accentColor` si la marca lo tiene, si no el primario.

### Idioma

Inglés y español (`src/i18n`). Gana el idioma del dispositivo si la app lo habla; si no, el
`defaultLanguage` de la marca. Ningún texto nombra una marca o un plato.

### Push

`@capacitor/push-notifications`, apagado salvo `push.enabled: true` (que el generador pone
solo si la marca tiene su `google-services.json`): sin ese archivo el plugin de Android
crashea en `register()`, así que la app ni lo llama. El permiso se pide después del primer
pedido, nunca al abrir. El token va a `POST /api/devices` con sesión; al cerrar sesión se
borra con `DELETE /api/devices/:id` antes de limpiar la sesión (con refresh si el token
venció, máximo ~3 s), se invalida el token en el dispositivo y se quitan las notificaciones
entregadas. Tocar una notificación con `data.orderId` abre el
seguimiento de ese pedido.

**No verificado sin un proyecto Firebase real.** En iOS el plugin entrega el token de APNs,
no el de FCM: para enviar por FCM HTTP v1 a iOS hace falta sumar Firebase Messaging al
proyecto de Xcode (o enviar por APNs). Pendiente para cuando haya una marca con push.

### Vista previa web de cualquier marca

```bash
# API local (localhost:3000) — el proxy de Vite evita CORS
npm run dev -w @ventea/mobile
# datos de producción, solo lectura de menú y marca
API_PROXY_TARGET=https://api.ventea.tech npm run dev -w @ventea/mobile
```

`http://localhost:5173/home?tenant=demo-burgers` (`&lang=es` fuerza idioma). Solo en `vite dev`: en producción web manda el host. En un binario
nativo `?tenant=` se ignora: una app, una marca.

### Firma

Un keystore por marca en `android/keystore.properties` (ignorado por git, plantilla en
`keystore.properties.example`). Sin ese archivo `assembleDebug` funciona y `release`
queda sin firmar.

## Mi marca y la app de cada marca (TASK-016)

El dueño edita su identidad en **Mi marca** (`/api/staff/brand`): nombre de la app, colores,
logo, ícono, descripción corta para la tienda, email de soporte, sitio e idioma. Logo, ícono y
fotos del menú se suben a Ventea (`POST /api/staff/media`): se re-codifican a WebP sin EXIF y se
sirven desde `/api/media/<tenantId>/<hash>.webp` (volumen `media`, ver
[deployment.md](deployment.md#medios-de-las-marcas)).

Con plan Pro o Cadena, el dueño **pide su app** (`POST /api/staff/brand/app-request`). Eso crea su
`AppConfig` en estado `requested`, que la plataforma ve en su cola (`GET
/api/platform/app-requests`) y avanza: `requested → building → in_review → published`. El
generador de apps (TASK-019) lee todo lo que necesita de `GET
/api/platform/tenants/:slug/app/build-config`.

**¿Quién publica en las tiendas?** Decidido en [ADR 0008](adr/0008-publicacion-apps-por-marca.md):
Pro en la cuenta de developer de Ventea, Cadena por defecto en la del cliente; la plataforma puede
cambiarlo (`publisher`).

**Firma y secretos**: un keystore por marca, fuera del repo. `.gitignore` ya bloquea
`*.keystore`, `*.jks`, `google-services.json` y `GoogleService-Info.plist`.

## Checklist de publicación

Antes de pasar la app a `building`:

1. Mi marca completa: `appDisplayName` (≤ 30), ícono cuadrado (≥ 1024 px de origen), logo,
   colores sin advertencias de contraste sin resolver, descripción corta (≤ 80), email de soporte
   y sitio `https://`.
2. Menú real con fotos propias, al menos una sucursal con horario y el programa de puntos
   configurado: es la diferenciación que pide Apple (4.2.6).
3. `bundleId` definitivo en `PATCH /api/platform/tenants/:slug/app` (no se puede cambiar después
   de publicar) y `publisher` según el plan.
4. Proyecto de Firebase de la marca con las apps Android e iOS de ese `bundleId`, APNs configurado
   en Firebase y la service account cargada (ver [Push](#push)).
5. Política de privacidad de la marca publicada y su URL a mano (ambas tiendas la exigen), con el
   mecanismo de borrado de cuenta.

Para publicar:

6. Generar el build con el `build-config` de la marca (TASK-019), `version` y `buildNumber`
   nuevos (el número de versión es compartido; el build number, por marca).
7. Firmar con el keystore / certificado **de esa marca** (cuenta de Ventea o del cliente, según
   `publisher`).
8. Fichas de tienda: nombre, descripción, capturas propias de la marca, categoría «Comida y
   bebida», clasificación de edad, formulario de seguridad de datos (Google) y etiquetas de
   privacidad (Apple): email, pedidos, token de dispositivo para avisos.
9. En la nota para la revisión de Apple: es la app oficial del restaurante, con su menú y
   sucursales; dar una cuenta de prueba.
10. Estado `in_review`; al aprobarse, `published` con los `storeUrls` de Android e iOS.
11. Probar en un teléfono real: instalar desde la tienda, crear un pedido, cambiar su estado
    desde el panel y ver la notificación.

## Push

Cada marca necesita **su propio proyecto de Firebase**: el token de push está atado al bundle id.
Ventea envía con **FCM HTTP v1** usando la service account de ese proyecto. Hoy **no está
verificado contra Firebase real** (no hay proyecto de prueba): los tests usan
`FakePushTransport`. Para configurarlo:

1. En Firebase, crear el proyecto de la marca y registrar las apps Android (`bundleId`) e iOS
   (mismo `bundleId`). Subir la clave APNs (`.p8`) de la cuenta que publica en _Cloud
   Messaging_.
2. _Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada_: baja un JSON.
3. Cargarlo (plataforma): `PUT /api/platform/tenants/<slug>/push-credentials` con ese JSON como
   body. Se guardan cifrados (AES-256-GCM con `PUSH_CREDENTIALS_KEY`) solo `project_id`,
   `client_email` y `private_key`; la respuesta dice `{configured: true, projectId}` y nunca
   devuelve la clave. Borrar el JSON local después.
4. `google-services.json` / `GoogleService-Info.plist` van al build de la app (no al repo).
5. La app registra el token con `POST /api/devices` al iniciar sesión y lo da de baja con
   `DELETE /api/devices/:id` al cerrarla.
6. Verificar: pedido de prueba → `preparing` desde el panel → notificación en el teléfono. En el
   log de la API: `Push preparing del pedido <código>: 1/1 enviados`. Si dice `no tiene
credenciales`, falta el paso 3; `FCM: envío rechazado (403 …)`, la service account no tiene
   permiso de FCM en ese proyecto.

Avisos que se mandan: pedido `preparing`, `ready`, `completed` y `cancelled` (por el local), en
el idioma de Mi marca (`es` · `en`).

**Versionado**: una versión del código produce N binarios. El número de versión es
compartido; el build number, por marca.
