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

## Generador de apps y publicación (TASK-019)

`tools/brand-app` saca el binario de una marca de la plantilla sin tocarla: copia el proyecto
nativo a `dist-apps/.work/<slug>/` (gitignored), le aplica la marca y compila ahí. Dos marcas
nunca comparten copia, y `apps/mobile/android|ios` queda siempre como está en git.

### Android

```bash
# desde la plataforma (lo normal): token de admin de plataforma en el entorno, nunca en la línea
export VENTEA_PLATFORM_TOKEN=…            # POST /api/platform/auth/login, dura 1 h
npm run brand:app -- --tenant demo-burgers --release --api-url https://api.ventea.tech

# sin token, desde un archivo de apps/mobile/brands (desarrollo)
npm run brand:app -- --tenant demo-burgers --config-from file --release
```

Pasos: lee `GET /api/platform/tenants/:slug/app/build-config` (o el archivo) → escribe
`brand.config.json` y `capacitor.config.json` de la copia → íconos (legacy, redondo y
adaptativo en 5 densidades) y splash con sharp, desde el ícono de Mi marca o, si no hay, la
inicial sobre el primario con el mismo criterio AA del tema → `applicationId`, `strings.xml`,
`versionCode`/`versionName` → reserva el `buildNumber` en la plataforma → `vite build` →
`cap sync` → `gradlew bundleRelease assembleRelease` → verifica el APK con `aapt2 dump badging`
(paquete, versión, nombre) y `apksigner verify --print-certs` (y que el AAB tenga el mismo
certificado) → deja todo en `dist-apps/<slug>/<versión>+<build>/`:

| Archivo              | Qué es                                                         |
| -------------------- | -------------------------------------------------------------- |
| `<slug>-<v>+<b>.aab` | Lo que se sube a Play Console                                  |
| `<slug>-<v>+<b>.apk` | Para instalar a mano y probar (`adb install`)                  |
| `metadata.json`      | Commit, badging, SHA-256 de cada archivo y del certificado     |
| `store-listing.md`   | Borrador de textos de tienda desde el branding (`‹completar›`) |
| `icon-1024.png`      | Ícono para la ficha de la tienda                               |

Al terminar, si la app estaba `not_requested` o `requested`, la pasa a `building`.
`--prepare-only` arma la copia sin compilar; `--version` y `--build-number` pisan los de la
plataforma. Sin `--release` sale un APK debug. `--app-api-url` cambia la API que usará la app
(p. ej. con la configuración leída de una API local).

Requisitos: JDK 21, `ANDROID_HOME` con build-tools, `npm ci`.

### Keystores: respaldarlos

Una marca nueva estrena keystore la primera vez que se compila en release:
`~/.ventea/keystores/<slug>.jks` y, al lado, `<slug>.properties` con su contraseña aleatoria
(solo el usuario: `0600`; en Windows, ACL sin herencia). **Respaldar los dos en el gestor de
secretos, fuera de esta máquina, apenas se crean**: sin ellos Play no acepta actualizaciones
de esa app. Son RSA 4096 con 30 años de validez. El generador nunca imprime la contraseña ni la
copia a la copia de trabajo: gradle recibe solo las rutas (`VENTEA_KEYSTORE_FILE`,
`VENTEA_KEYSTORE_PROPERTIES`), y ningún proceso hijo (vite, cap, gradle, git) hereda el token de
plataforma ni la cuenta del dueño.

Con _Firma de apps de Play_, este keystore es la **clave de subida** (_upload key_): Google firma
lo que se instala con su propia clave de la app. Si la clave de subida se pierde o se filtra, se
pide un reset en Play Console (_Integridad de la app → Firma de apps → Solicitar restablecimiento
de la clave de subida_); sin Play App Signing, perderla es perder la app.

Solo para una marca que **ya tiene app publicada en Play con otro keystore**: se firma con ese,
leído donde está y sin copiarlo (`--keystore-props <ruta> [--keystore <ruta>]` o
`VENTEA_BRAND_KEYSTORE_PROPS`). Su `applicationId`, versión y build mínimo van en la plataforma
(`PATCH /api/platform/tenants/:slug/app` con `bundleId`, `version`, `buildNumber`) o en su
archivo de `brands/` (`version`, `buildNumber`); el build number nunca baja de ese mínimo. El
SHA-256 del certificado queda en `metadata.json` para compararlo con el de Play Console.

**Carolina** no está publicada: firma con su keystore de producción nuevo,
`~/.ventea/keystores/carolina-hot-chicken.jks`, no con el de desarrollo de su repo. Conserva el
`applicationId` de la app anterior (`com.carolinahotchicken.app`, desde 1.2.0 build 4), pero
como la firma cambia, el APK 1.1.0 instalado a mano **no se actualiza**: hay que desinstalarlo
antes de instalar el nuevo (se pierde la sesión de ese teléfono).

Si la app anterior guardaba la sesión con otro prefijo, `legacyStoragePrefix` (o
`--legacy-storage-prefix chc.`) migra `session`, `favourites` y `checkout.attempt` a
`ventea.<slug>.*` en el primer arranque de la app nativa (en la web, nunca), sin pisar datos
nuevos. En Carolina queda declarado aunque hoy no migre nada: es inofensivo.

### Push en el build

Si existe `~/.ventea/brands/<slug>/google-services.json` (o bajo `VENTEA_BRAND_SECRETS_DIR`), se
copia a la copia de trabajo y el build sale con `push.enabled: true`. En iOS sigue apagado hasta
sumar Firebase Messaging al proyecto de Xcode (ver [Push](#push)).

### iOS

En una Mac (Xcode 16+, Node 22):

```bash
npm ci
npm run brand:app -- --tenant demo-burgers --platform ios --config-from file
open dist-apps/.work/demo-burgers/ios/App/App.xcodeproj
# Signing & Capabilities: Team de la cuenta que publica · Product → Archive → Distribute
```

Sin Mac: workflow **Brand app (iOS)** (`.github/workflows/brand-app-ios.yml`, manual con el
slug). Cada marca es un _Environment_ de GitHub con su nombre, limitado a la rama `main`
(_Deployment branches_) y con revisores obligatorios, y los secrets `IOS_DIST_CERT_P12_BASE64`,
`IOS_DIST_CERT_PASSWORD`, `IOS_PROFILE_BASE64` e `IOS_TEAM_ID`. Con firma exporta el `.ipa` para
App Store Connect; sin ella compila sin firmar, para validar. El `.ipa` se sube con Transporter o
`xcrun altool`.

App Store Connect rechaza un build number (`CFBundleVersion`) repetido, y con `config_from:
file` el runner no conoce el último subido: sale siempre el `buildNumber` del archivo de marca.
Desde la segunda subida, pasar el input **`build_number`** mayor que el último subido. El
workflow lo valida (entero positivo, sin ceros a la izquierda) y lo pasa al generador por env,
nunca interpolado en el script; el generador además rechaza un número menor que el mínimo de la
marca. Alternativa: subir `buildNumber` en `brands/` (commit en `main`) antes de cada corrida.

La configuración sale por defecto del archivo de `brands/` (`config_from: file`). Con
`config_from: api` lee `https://api.ventea.tech` (fijo) con un token de plataforma, que dura 1 h:
cargarlo fresco justo antes (`gh secret set VENTEA_PLATFORM_TOKEN --env <slug>`) y borrarlo al
terminar (`gh secret delete VENTEA_PLATFORM_TOKEN --env <slug>`). **Nunca como secret
permanente.**

### Fotos de una app anterior

```bash
VENTEA_API_URL=https://api.ventea.tech VENTEA_OWNER_EMAIL=… VENTEA_OWNER_PASSWORD=… \
  npm run brand:import-images -- --tenant carolina-hot-chicken \
  --dir ../carolina-hot-chicken/src/assets            # mapa: tools/brand-app/maps/<slug>.json
```

El mapa es `{ "items": { "<producto>": "<archivo>" }, "brand": { "logo": …, "icon": … } }`, con
rutas relativas a `--dir`. Empareja por nombre normalizado (como la app vieja), sube una imagen a
la vez (reintenta los 503 del límite de procesamiento) y no toca lo que ya tiene imagen salvo
`--force`. `--dry-run` muestra qué haría. Cada subida cuenta para el cupo de 60 por hora.

### Publicar en las tiendas

Antes, la [checklist](#checklist-de-publicación). Luego, según `publisher`
([ADR 0008](adr/0008-publicacion-apps-por-marca.md)):

**Google Play Console** (cuenta de Ventea, o la del cliente con acceso de administrador para
Ventea):

1. _Crear app_: nombre de `store-listing.md`, idioma por defecto el de la marca, gratuita.
2. _Firma de apps de Play_: Google guarda la clave de firma; el keystore de la marca queda como
   **clave de subida**. En una app que ya existe, no cambia nada.
3. Ficha principal: textos de `store-listing.md`, ícono 512×512 (reducir `icon-1024.png`),
   gráfico de funciones 1024×500 y al menos 2 capturas de teléfono de la marca.
4. _Contenido de la app_: política de privacidad (URL), acceso a la app (cuenta de prueba),
   anuncios: no, clasificación de contenido, público objetivo (no niños), seguridad de datos
   (email, nombre, pedidos, token de dispositivo; cifrado en tránsito; borrado de cuenta).
5. Categoría «Comida y bebida», email de soporte y sitio.
6. _Pruebas internas_ → subir el `.aab` → probar en un teléfono. Una cuenta de developer
   **personal** nueva exige además una _prueba cerrada_ con al menos 12 testers durante 14 días
   seguidos antes de poder pedir _Producción_ (las cuentas de organización no). Planificarlo con
   la marca.
7. Plataforma: `status: in_review`; al aprobarse, `published` y `storeUrls.android`.

**App Store Connect** (cuenta de Ventea, o la del cliente con rol App Manager para Ventea):

1. _Certificates, IDs & Profiles_: App ID con el `bundleId` (capacidad Push Notifications) y
   perfil de distribución App Store; cargarlos como secrets del environment de la marca.
2. _Mis apps → +_: nombre (≤ 30), idioma, bundle id, SKU = slug.
3. Información: subtítulo (≤ 30), categoría Comida y bebida, URL de privacidad y de soporte,
   etiquetas de privacidad (contacto, identificadores, compras; vinculados al usuario, sin
   rastreo), clasificación por edad.
4. Capturas de 6.9" y 6.5" (y 13" de iPad si se publica para iPad), propias de la marca.
5. Subir el `.ipa` (workflow o Xcode) → TestFlight interno → probar.
6. Revisión: cuenta de prueba con la que se pueda pedir y la **nota de `store-listing.md`**
   (app oficial del restaurante, contenido propio, programa de puntos, push de estado).
7. **4.2.6** (apps de plantilla): Apple pide que la app la envíe el dueño del contenido. Para
   iOS, recomendar `publisher = client` (cuenta del restaurante) **desde el inicio**, también en
   plan Pro; desde la cuenta de Ventea solo con la diferenciación de ADR 0008 y asumiendo el
   riesgo. Si rechazan por 4.2.6, no insistir: mover la marca a su cuenta y volver a enviar.
8. Plataforma: `in_review` → `published` con `storeUrls.ios`.

Pendiente por marca, fuera del repo: cuentas de developer (Google, pago único; Apple, anual),
proyecto de Firebase, política de privacidad publicada y capturas reales.
