# Respuestas del checklist del App Store — Carolina Hot Chicken

Responde, punto por punto, **solo los ítems que siguen sin marcar** en
[`APP_STORE_CHECKLIST.md`](APP_STORE_CHECKLIST.md) (los ya marcados `[X]` no se repiten).
Redactado el **2026-11-27** con lo que hay en el repo y en producción ese día.

**Cómo leerlo.** Cada ítem trae un estado:

- ✅ **Listo**: ya resuelto; se indica dónde está o cómo se comprobó.
- 🟡 **Falta (código/archivos)**: se puede resolver desde el repo.
- 🔴 **Falta (portal/cuenta/persona)**: depende de Apple, de la cuenta o de una decisión del dueño.
- ❓ **No verificado**: no pude comprobarlo desde acá; se dice qué mirar.

Datos fijos de la marca (usar tal cual):

| Dato | Valor |
|---|---|
| Nombre | Carolina Hot Chicken |
| Bundle ID / SKU | `com.carolinahotchicken.app` / `carolina-hot-chicken` |
| Versión de la app | 1.2.0 (Android build 13 generado; el de iOS aún no) |
| Sitio y web de la app | https://fe.carolinahotchicken.com |
| Privacidad | https://fe.carolinahotchicken.com/privacy |
| Términos | https://fe.carolinahotchicken.com/terms |
| API | https://api.carolinahotchicken.com |
| Email de soporte | hola@ventea.tech |
| Cuenta de revisión | `appreview@carolinahotchicken.com` (la clave está en `dist-apps/carolina-hot-chicken/app-store/app-store-connect.md`, no se copia acá) |
| Deploy en producción | commit `f65c427`, desplegado en Dokploy el 2026-11-27. `DELETE /api/me` sin sesión responde 401 y el bundle web ya trae los textos legales. Rollback: `compose.before-f65c427.yml` (api `f67472d`, web `e94c1bb-carolina`) |

Material ya generado: `dist-apps/carolina-hot-chicken/app-store/` (`app-store-connect.md`,
`screenshots/iphone-6.9`, `iphone-6.5`, `ipad-13`) y `dist-apps/carolina-hot-chicken/1.2.0+13/store-listing.md`.

---

## 0. Bloqueantes sin marcar

| Ítem | Estado | Respuesta |
|---|---|---|
| URL de soporte con datos de contacto reales | 🟡 | Hoy se usa `/privacy` (sección de contacto) con `hola@ventea.tech`. Apple pide una página de soporte con contacto real: falta crear `/support` (ver 9.2). Mientras tanto, ese enlace es el provisional. |
| Cuestionario de clasificación por edad | 🔴 | Respuestas listas: todo «None/No» → **4+** (ver 7). Hay que cargarlas en App Store Connect. |
| Al menos 8 capturas de iPhone (y 8 de iPad) | 🟡 | Hay **5 por tamaño** (inicio, menú, producto, carrito, perfil con puntos) en 6.9", 6.5" e iPad 13". Ojo: este ítem dice 8, pero la tabla 8.3 del mismo documento dice «de 1 a 10»; Apple exige mínimo 1. Con 5 alcanza para enviar; si se quieren 8, faltan seguimiento del pedido, sucursales y otra de puntos. |
| Borrado de cuenta dentro de la app | ✅ | Perfil → «Delete account» → «Delete my account». Llama a `DELETE /api/me`; devuelve 409 si hay un pedido activo. Desplegado en producción el 2026-11-27 (401 sin sesión). **Falta correr el e2e** `apps/api/test/e2e/account-deletion.e2e-spec.ts` (Docker Desktop daba error 500). |
| Cuenta de prueba que no venza y backend encendido | 🟡 | La cuenta existe en producción. Falta confirmar que la sucursal figure «abierta» durante la revisión y reemplazar las direcciones que en producción dicen «To be defined» (ver 11). |

---

## 2. Certificados, identificadores y perfiles

El encabezado del punto dice «solo si usas push o inicio de sesión con Google/Apple». **Carolina usa push** (`pushEnabled: true`, plugin `@capacitor/push-notifications`) y **no tiene** inicio de sesión con Google ni Apple (solo email y contraseña propios). Por eso:

| Ítem | Estado | Respuesta |
|---|---|---|
| App ID con el `bundleId` de la marca | 🔴 | El bundle de la marca es **`com.carolinahotchicken.app`** (`apps/mobile/brands/brand.carolina.json` y `metadata.json`); no encontré ahí el `-test` que se menciona. La plantilla del proyecto iOS trae `app.ventea.template`, que el generador reemplaza al compilar: confirmar que el build de iOS salga con el id correcto. **Disponibilidad en Apple: ❓ no verificable sin entrar a developer.apple.com** (Certificates, Identifiers & Profiles → Identifiers → «+» → App IDs; si está tomado, Apple lo rechaza al registrarlo). Si está tomado, alternativas: `com.carolinahotchicken.ios` o `hn.com.carolinahotchicken.app`, y cambiarlo en la marca antes de subir el primer build (no se puede cambiar después). El mismo id ya está registrado en Play Console, pero son tiendas distintas: no garantiza nada en Apple. |
| Capacidades del App ID: Push Notifications | 🔴 | **Sí, activar.** Además 🟡: el proyecto iOS de la plantilla **no tiene archivo `.entitlements` ni `aps-environment`**; sin eso el iPhone no registra el token de push. Hay que añadirlo (Capability «Push Notifications» en Xcode) en el generador de marca. |
| Sign in with Apple | ✅ No aplica | No hay login con Google/Facebook (guía 4.8 no se activa). |
| Associated Domains | ✅ No aplica | No se usan universal links. |
| Clave APNs `.p8` subida a Firebase/servidor | 🔴 | Pendiente: generarla en el portal (Keys → «+» → APNs) y subirla a donde se envían los pushes. Guardar el Key ID y el Team ID. |
| Certificado Apple Distribution `.p12` + perfil App Store | 🔴 | Pendiente: lo crea quien tiene la cuenta de Apple. |
| Secrets `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `IOS_TEAM_ID` | 🔴 | Pendiente: se cargan cuando existan el certificado y el perfil de arriba. |

---

## 3. El build

### 3.2 Info.plist

| Ítem | Estado | Respuesta |
|---|---|---|
| Textos de permiso `NS…UsageDescription` | ✅ No hacen falta | La app no usa ubicación, cámara, fotos ni contactos: solo `@capacitor/app`, `@capacitor/push-notifications` y `@capacitor/status-bar`. Las sucursales se eligen a mano. Si algún día se añade ubicación o QR, agregar el texto antes. (El permiso de notificaciones lo pide el sistema, no lleva `UsageDescription`.) |
| `ITSAppUsesNonExemptEncryption = false` | ✅ | Ya está en `Info.plist` (solo HTTPS del sistema). |
| `UIBackgroundModes` → `remote-notification` | ✅ No hace falta | Los pushes son de estado de pedido, visibles; no hay pushes silenciosos. |
| Sin `NSAllowsArbitraryLoads` | ✅ | No aparece en `Info.plist`. |

### 3.3 Privacy manifest

| Ítem | Estado | Respuesta |
|---|---|---|
| Agregar `PrivacyInfo.xcprivacy` al target | 🟡 | **No existe en el repo** (busqué en el proyecto iOS). Hay que crearlo y declarar al menos `UserDefaults` con motivo `CA92.1` (lo usa Capacitor/Preferences). Verificar contra los plugins reales y los pods. |
| Tipos de datos y rastreo (`NSPrivacyTracking`) | 🟡 | `NSPrivacyTracking = false`. Datos recolectados: nombre, email, teléfono (opcional), historial de pedidos, token de dispositivo; todos «App Functionality», vinculados al usuario, sin rastreo. |
| Manifest/firma de SDK de terceros | ❓ | Capacitor trae el suyo; revisar los pods tras compilar. No hay Firebase Analytics ni Crashlytics en la app. |
| Generate Privacy Report y comparar con el punto 6 | 🔴 | Se hace en Xcode al archivar (necesita Mac). |

### 3.4 Calidad mínima

| Ítem | Estado | Respuesta |
|---|---|---|
| Sin crashes en iPhone real; red lenta y sin red | 🔴 | Necesita iPhone y Mac; no probado. |
| Sin placeholders ni pantallas vacías | 🟡 | **Riesgo real:** en producción las direcciones de las sucursales dicen «To be defined». Apple lo puede leer como placeholder (2.1/2.2). Hay que cargar las direcciones reales antes de enviar. |
| La app aporta más que un sitio empaquetado (4.2) | ✅ | Menú con detalle y nivel de picante, carrito, pedido para retirar, seguimiento en vivo, puntos y push de estado. |
| El push no es obligatorio | ✅ | Se puede pedir y ver todo sin aceptar notificaciones. Los pushes solo informan el estado del pedido. |
| Safe areas, modo oscuro, texto dinámico | ❓ | Marca «dark-first»; no verifiqué texto dinámico en un iPhone. |

### 3.5 Subida y TestFlight

| Ítem | Estado | Respuesta |
|---|---|---|
| Archivar y subir | 🔴 | Pendiente: el **build de iOS no está hecho**. Hay pasos en `docs/` (commit `05431fd`: «pasos para compilar el iOS igual a la Android 1.2.0 (13)»). El proyecto actual trae `MARKETING_VERSION = 0.2.0` de plantilla; el build de marca debe salir como **1.2.0** con build number mayor al último subido. Deployment target actual 15.0 (cumple ≥ 13). |
| Esperar el procesamiento | 🔴 | Tras subir. |
| Cuestionario de exportación | ✅ | Innecesario (clave ya en `Info.plist`). |
| TestFlight interno: flujo completo | 🔴 | Probar: registro, pedido (retiro), seguimiento, puntos, push, borrado de cuenta. **No hay pago en la app**: se paga en el restaurante. |
| TestFlight externo | ✅ Opcional | No se necesita. |

---

## 4–5. App Store Connect: alta de la app e información de la app

| Ítem | Estado | Respuesta |
|---|---|---|
| Crear la app (formulario «Nueva app») | 🔴 | Plataforma iOS · Nombre **Carolina Hot Chicken** (20 caracteres, ≤ 30; ❓ puede estar tomado en el App Store) · Idioma principal **English (U.S.)** (textos en inglés, igual que en Play) · Bundle ID el del punto 2 · SKU `carolina-hot-chicken` · Acceso total. |
| Nombre y subtítulo (≤ 30) | ✅ | Nombre: `Carolina Hot Chicken`. Subtítulo: `Nashville hot chicken to go` (27). |
| Categoría principal | ✅ | Food & Drink. Secundaria: ninguna (opcional). |
| Derechos de contenido | 🔴 | Declarar «Sí, tengo los derechos». **Lo confirma el restaurante**: que tiene derecho sobre logo, fotos del menú y nombre. |
| Clasificación por edad | 🔴 | Ver 7. |
| URL de política de privacidad | ✅ | https://fe.carolinahotchicken.com/privacy |
| Privacy Choices URL | ✅ Opcional | Se puede dejar vacía. |
| Licencia (EULA) | ✅ | EULA propio en https://fe.carolinahotchicken.com/terms (también enlazado desde Registro y Perfil). ❓ Revisar que contenga los términos mínimos de Apple («Instructions for Minimum Terms of Developer's EULA») o, si no, usar el EULA estándar de Apple y dejar `/terms` como términos de uso. |
| Estado de comerciante (DSA) de la app | ✅ | Marcado en 1.3 (trader). |
| Dispositivo médico | ✅ No aplica | |

---

## 6. Privacidad de la app (App Privacy)

| Ítem | Estado | Respuesta |
|---|---|---|
| ¿Recolectás datos? | 🔴 | **Sí.** Cargar en App Store Connect. Rastreo: **No**. Sin anuncios ni analítica de terceros. |
| Tipos por dato | 🔴 | Todos *App Functionality*, **vinculados al usuario**, **sin rastreo**: Contact Info → Name; Contact Info → Email Address; Contact Info → Phone Number (opcional); Purchases → Purchase History (historial de pedidos); Identifiers → Device ID (token de push). **No** declarar: ubicación (no se usa), dirección física (no hay envío a domicilio: solo retiro), Payment Info (la tarjeta no pasa por la app), Usage Data ni Diagnostics (no hay analytics ni Crashlytics). |
| Rastreo / App Tracking Transparency | ✅ No aplica | No se cruzan datos con terceros; no implementar ATT. |
| Coherencia etiquetas = manifest = política | 🟡 | Hacer la comprobación final cuando exista el `PrivacyInfo.xcprivacy` (3.3) y revisar `/privacy` con esta misma lista. |

---

## 7. Clasificación por edad

| Ítem | Estado | Respuesta |
|---|---|---|
| Cuestionario (App Information → Age Rating) | 🔴 | Controles y capacidades: **No** a chat, contenido generado por usuarios, acceso web sin restricción, redes sociales; **no** hay controles parentales ni verificación de edad. Contenido: **None** en todo (violencia, sexo, lenguaje, drogas, apuestas, horror, temas médicos). Resultado esperado: **4+**. |
| Alcohol en el menú | ❓ | **Confirmar con el restaurante** que el menú de la app no vende ni muestra alcohol. Si lo hace, hay que declararlo y sube la edad. |
| Override por edad mínima de los términos | ✅ No aplica | No hay edad mínima mayor a la calculada. |
| Textos y capturas aptos para 4+ | ✅ | Capturas con comida y marca; sin contenido sensible. |

---

## 8. Ficha de la versión

### 8.1–8.2 Textos (inglés, idioma principal)

| Campo | Estado | Respuesta |
|---|---|---|
| Texto promocional (≤ 170) | 🔴 | Propuesta (136): `Nashville hot chicken, your way. Pick your heat level, order ahead for pickup, track it live and earn points on every order.` |
| Descripción (≤ 4.000) | ✅ | La «Descripción larga» de `dist-apps/carolina-hot-chicken/1.2.0+13/store-listing.md`. |
| Palabras clave (100 bytes) | 🔴 | Propuesta (sin repetir nombre ni subtítulo, sin espacios, ~88 bytes): `fried,spicy,pickup,order,loyalty,points,tenders,sandwich,restaurant,food,menu,rewards` |
| Novedades | ✅ No aplica | No existe en la v1. |
| URL de soporte | 🟡 | Provisional: `/privacy`. Definitiva: `/support` (ver 9.2). |
| URL de marketing | ✅ Opcional | https://fe.carolinahotchicken.com |
| Copyright | 🔴 | Hoy `2026 Carolina Hot Chicken`. Apple pide el **nombre legal** de quien publica: confirmar la razón social con el restaurante. |
| Versión | 🔴 | `1.2.0`, igual al `CFBundleShortVersionString` del build. |
| Repetir por cada idioma | ✅ | Solo inglés por ahora. |

### 8.3 Capturas

| Ítem | Estado | Respuesta |
|---|---|---|
| iPhone 6.9" (1320×2868) | ✅ | `app-store/screenshots/iphone-6.9` (5 imágenes). |
| iPhone 6.5" (1284×2778) | ✅ | `app-store/screenshots/iphone-6.5` (5). |
| iPad 13" (2064×2752) | ✅ | `app-store/screenshots/ipad-13` (5). Hacen falta porque el target es iPhone **y** iPad (`TARGETED_DEVICE_FAMILY = 1,2`). |
| Mostrar la app en uso, datos ficticios | ✅ | Orden: inicio · menú · producto · carrito · perfil con puntos. Generadas con Playwright contra la web local apuntando a la API de producción; ❓ revisar a ojo que no muestren datos personales reales. |
| Texto de marketing encima / sin marcos de otros dispositivos | 🟡 | Son capturas limpias, sin texto de marketing añadido. Opcional mejorarlas. |
| Seguimiento del pedido y sucursales en las capturas | 🟡 | No incluidas; añadirlas si se quieren 8. |

### 8.4 Video

Opcional: no hay. Omitir.

### 8.5 Build y publicación

| Ítem | Estado | Respuesta |
|---|---|---|
| Elegir el build procesado | 🔴 | Depende del build de iOS (3.5). |
| Forma de publicación | 🔴 | Recomendado: **manual** (primera versión). Sin phased release en la v1. |
| Precio y disponibilidad | 🔴 | Gratis. **Países: decide el restaurante.** Si solo opera en un país, limitarlo a ese. |

---

## 9. Páginas web y textos legales

### 9.1 Política de privacidad — https://fe.carolinahotchicken.com/privacy

Implementada (EN/ES, operador Ventea como proveedor técnico y el restaurante como responsable; desplegada). **Hay que revisarla contra esta lista** antes de enviar; yo comprobé que el texto está en producción, no cada punto:

- [ ] Responsable: razón social, dirección y contacto del restaurante (❓ hoy figura el contacto de Ventea `hola@ventea.tech`).
- [ ] Datos recolectados y para qué (debe coincidir con el punto 6).
- [ ] Terceros con quienes se comparte (hosting, proveedor de push) y que dan la misma protección.
- [ ] Cuánto tiempo se guardan y cómo se borran.
- [ ] Cómo borrar la cuenta (Perfil → Delete account) y qué datos se conservan por ley.
- [ ] Derechos según la ley local (🔴 el restaurante dice el país).
- [ ] Notificaciones push (sí) y ubicación (no se usa).
- [ ] Fecha de última actualización.

### 9.2 Página de soporte

| Ítem | Estado | Respuesta |
|---|---|---|
| Email/teléfono y horarios | 🟡 | Falta la página. Mínimo: email `hola@ventea.tech`; el restaurante debe dar **teléfono o WhatsApp y horario de atención** reales. |
| Preguntas frecuentes | 🟡 | Falta: pedidos para retirar, cómo pagar (en el restaurante), puntos, cuenta. |
| Enlace a cómo borrar la cuenta | 🟡 | Falta: Perfil → Delete account. |

Propuesta: crear la ruta pública `/support` en la web de la marca (igual que `/privacy` y `/terms`) y usarla como URL de soporte.

### 9.3 Términos y condiciones — https://fe.carolinahotchicken.com/terms

Implementados; revisar con esta lista:

- [ ] Uso de la app/cuenta y edad mínima.
- [ ] Pedidos, precios, pagos, cancelaciones y reembolsos (los gestiona el restaurante; pago en el local).
- [ ] **Puntos**: cómo se ganan, vencimiento, sin valor en efectivo, **no se compran**.
- [ ] Promociones y cupones.
- [ ] Responsabilidad del restaurante por menú, alérgenos y entrega.
- [ ] Ley aplicable y jurisdicción (🔴 depende del país).
- [ ] Términos mínimos de Apple si se carga como EULA propio (ver 4–5).
- [x] Enlace dentro de la app (Registro y Perfil).

### 9.4 Marketing

Opcional. Omitir en la primera versión.

---

## 10. Requisitos funcionales que revisa Apple

| Ítem | Estado | Respuesta |
|---|---|---|
| Borrado de cuenta dentro de la app (5.1.1(v)) | ✅ | Ver «Bloqueantes». |
| No exigir registro para lo que no lo necesita | ✅ | Inicio, menú y producto son públicos; el registro solo se pide para pedir y ver puntos. |
| Sign in with Apple (4.8) | ✅ No aplica | Solo email y contraseña propios. |
| Pagos (3.1.3(e)) | ✅ | **No hay pago en la app**: pedido para retirar y pago en el restaurante. Los puntos no se compran. |
| Push (4.5.4) | ✅ | Solo estado del pedido, sin promociones. Si algún día se mandan promociones, pedir consentimiento y permitir baja dentro de la app. |
| Permisos no condicionan funciones (5.1.2(i)) | ✅ | Nada se condiciona a aceptar push. |
| Enlaces a privacidad y soporte dentro de la app (1.5) | 🟡 | Privacidad y términos están (Registro y Perfil). Falta el enlace de **soporte** cuando exista `/support`. |
| Contenido generado por usuarios (1.2) | ✅ No aplica | No hay reseñas ni comentarios. |

---

## 11. Formulario de revisión (App Review Information)

| Ítem | Estado | Respuesta |
|---|---|---|
| Credenciales de prueba que no venzan | 🟡 | Usuario `appreview@carolinahotchicken.com`, creada en producción; clave en `app-store-connect.md`. Sin 2FA ni SMS. Confirmar que tenga puntos y un pedido de ejemplo cargados. |
| Backend encendido y sucursal «abierta» | 🟡 | Backend desplegado el 2026-11-27. Mantener la sucursal abierta durante la revisión (días) o decirlo en las notas. Cargar las direcciones reales (ver 3.4). |
| Contacto: nombre, email y teléfono internacional | 🔴 | Lo da quien publica; formato `+504…` o el del país. |
| Notas para la revisión (≤ 4.000 bytes) | ✅ | Texto listo en `app-store/app-store-connect.md` («Revisión de la app»): app oficial del restaurante, cómo probar sin pagar (no hay pagos en la app), cómo borrar la cuenta, push solo de estado. Si se añaden permisos, explicarlos. |
| Video del flujo | ✅ Opcional | No necesario. |
| 4.2.6: enviar desde la cuenta del dueño del contenido | 🔴 | **Decisión pendiente del dueño del proyecto:** el campo «Cuenta que publica» de `store-listing.md` sigue en «‹completar›». Recomendado: cuenta del restaurante (`publisher = client`), con Ventea como App Manager. |

---

## 12. Cumplimiento extra

| Ítem | Estado | Respuesta |
|---|---|---|
| Exportación de cifrado | ✅ | `ITSAppUsesNonExemptEncryption = false`; no se usa cifrado propio. |
| Accessibility Nutrition Labels | ✅ Opcional | Voluntarias; dejar sin completar por ahora. |
| Leyes locales (precios con impuestos, alérgenos) | 🔴 | **Lo confirma el restaurante** según el país donde opera: si los precios del menú incluyen impuestos y si la ley local pide informar alérgenos. |

---

## 13. Envío y después

Todo queda pendiente hasta tener el build de iOS en TestFlight. Cuando esté publicada: guardar la URL de la app en la plataforma (`status: published`, `storeUrls.ios`), probar la descarga en un iPhone limpio y poner un recordatorio para renovar la membresía anual.

---

## Resumen: qué falta y quién lo hace

**Desde el repo (código/archivos):**
1. Crear `/support` y enlazarla dentro de la app.
2. Añadir `PrivacyInfo.xcprivacy`.
3. Añadir la capacidad Push Notifications (`aps-environment`) al proyecto iOS de la marca y confirmar el bundle id al generar.
4. Direcciones reales de las sucursales en producción.
5. Correr el e2e de borrado de cuenta.

**Portal de Apple / cuenta (quien tiene la cuenta):**
6. Registrar el App ID y activar Push; generar clave APNs, certificado de distribución y perfil; cargar los secrets.
7. Crear la app en App Store Connect y cargar privacidad, edad, textos, capturas y notas.
8. Compilar en Mac, subir, probar en TestFlight con un iPhone real.

**Decisiones del restaurante / dueño:**
9. Cuenta que publica (4.2.6), razón social para el copyright, país o países de disponibilidad, teléfono/WhatsApp y horario de soporte, contacto del formulario de revisión, derechos de contenido, si el menú vende alcohol, y leyes locales (impuestos, alérgenos).
