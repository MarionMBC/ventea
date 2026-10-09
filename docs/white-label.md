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

## Lo que hay que decidir antes del segundo cliente

**¿Quién publica en las tiendas?** Dos caminos, y conviene elegirlo antes de vender la
segunda licencia:

- **Cuenta del cliente**: la app aparece a nombre de la marca (mejor para ellos), pero
  cada publicación depende de que nos den acceso, y son N cuentas que gestionar.
- **Cuenta nuestra**: publicamos todo, más simple de operar, pero Apple rechaza apps que
  son la misma plantilla repetida sin diferenciación real — hay que poder justificar que
  cada una es un negocio distinto.

**Firma y secretos**: un keystore por marca, fuera del repo. `.gitignore` ya bloquea
`*.keystore`, `*.jks`, `google-services.json` y `GoogleService-Info.plist`.

**Push**: cada marca necesita su propio proyecto de Firebase / certificado APNs, porque
el token está atado al bundle id.

**Versionado**: una versión del código produce N binarios. El número de versión es
compartido; el build number, por marca.
