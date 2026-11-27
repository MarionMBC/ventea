# Checklist: publicar una app en el App Store (producción)

Lista de todo lo que pide Apple para pasar una app de Ventea (Ionic + Capacitor) a producción
en el App Store: cuenta, formularios, ficha, capturas, páginas web, textos legales, build y
revisión. Complementa el paso a paso por marca de [`docs/white-label.md`](../white-label.md)
y el borrador de textos que genera `tools/brand-app/src/store-listing.ts` (`store-listing.md`).

> Revisado contra la documentación oficial de Apple el **2026-11-27**. Apple cambia límites,
> tamaños y plazos seguido: antes de cada publicación, revisar las [fuentes](#fuentes).
> Lo marcado **(verificar)** no se pudo confirmar en una página oficial.

---

## 0. Resumen de bloqueantes

Sin estos puntos Apple no deja enviar la app o la rechaza:

- [X] Membresía del Apple Developer Program activa (cuenta del dueño del contenido, ver 4.2.6).
- [X] Acuerdo de apps pagas firmado, más datos fiscales y bancarios si se cobra algo.
- [X] Estado de comerciante (DSA de la UE) declarado.
- [X] Build con **Xcode 26 o posterior y SDK de iOS 26**, con target mínimo **iOS 13 o posterior**.
- [X] Privacy manifest (`PrivacyInfo.xcprivacy`) con los motivos de las APIs de motivo obligatorio.
- [X] URL de política de privacidad (en la ficha **y** dentro de la app).
- [ ] URL de soporte con datos de contacto reales.
- [X] Etiquetas de privacidad (App Privacy) completas.
- [ ] Cuestionario de clasificación por edad respondido (sistema nuevo).
- [ ] Al menos 8 captura de iPhone (y 8 de iPad 13" si la app corre en iPad).
- [ ] Borrado de cuenta dentro de la app, si la app permite crear cuenta.
- [ ] Cuenta de prueba que no venza y backend encendido durante la revisión.

---

## 1. Cuenta y acuerdos (una vez por cuenta)

### 1.1 Apple Developer Program

- [X] Inscripción como **organización** (recomendado para un restaurante), no como persona.
  - [X] Número **D-U-N-S** de la empresa (gratis; puede tardar días).
  - [X] Entidad legal con nombre exacto, sitio web propio del dominio de la empresa.
  - [X] Apple ID con autenticación de dos factores, de la persona con autoridad legal.
  - [X] Pago de la membresía anual (USD 99 o equivalente local).
- [X] Roles en App Store Connect → _Usuarios y acceso_: si publica la cuenta del cliente, dar a
  Ventea el rol **App Manager** (y **Developer** si firma builds).

### 1.2 Acuerdos, impuestos y banca (_Business_ / _Negocios_)

- [X] Aceptar el **Apple Developer Program License Agreement** vigente (se renueva y bloquea
  envíos si queda pendiente).
- [X] **Free Apps Agreement**: viene aceptado por defecto.
- [X] **Paid Apps Agreement**: solo si hay compras in-app o la app es paga. Una app de pedidos
  de comida cobra con pasarela propia (guía 3.1.3(e)) y **no** lo necesita.
  - [X] Si se firma: formularios fiscales (W-8BEN-E para empresas fuera de EE. UU., W-9 dentro).
  - [X] Cuenta bancaria a nombre de la entidad.
  - [X] Contactos: Senior Management, Finance, Technical, Legal, Marketing.

### 1.3 Ley de Servicios Digitales de la UE (DSA)

Obligatorio declararlo aunque no se distribuya en la UE. Sin estado de comerciante, Apple quita
la app del App Store de la UE (desde el 17-02-2025).

- [X] _Business → Agreements → Compliance → Digital Services Act_: elegir **trader** (comerciante)
  o **non-trader**. Un restaurante que vende es casi siempre **trader**.
- [X] Si es trader: dirección (sale del D-U-N-S), teléfono y email públicos en la ficha de la UE.
- [X] Verificar el email y el teléfono (2FA) y subir un documento de la empresa.
- [X] Certificar que se cumple la legislación de la UE.
- [X] Por app, en _App Compliance_: confirmar el estado; URL de _Labels and Markings_ (opcional).

---

## 2. Certificados, identificadores y perfiles (developer.apple.com) Solo si usas notificaciones push o inicio de sesion con google y con apple.

- [ ] **App ID** explícito con el `bundleId` de la marca (no se puede cambiar después de subir
  un build) actualmente esta usando: com.carolinahotchicken-test.app se debe cambiar a uno que no este usado, investiga el nombre que coloques si esta disponible.
- [ ] Si tiene notificaciones e inicio de sesion con google o apple: Capacidades del App ID:
  - [ ] **Push Notifications**.
  - [ ] **Sign in with Apple**, si la app ofrece login con Google/Facebook (guía 4.8).
  - [ ] **Associated Domains**, si se usan universal links.
- [ ] Clave **APNs** (`.p8`, recomendada) subida a Firebase/servidor de push. El trust store del
  servidor debe incluir **USERTrust RSA Certification Authority** (certificado nuevo de APNs
  desde el 24-02-2025).
- [ ] Certificado **Apple Distribution** (`.p12`) y perfil de aprovisionamiento **App Store**.
- [ ] Cargar como secrets del environment de la marca: `IOS_DIST_CERT_P12_BASE64`,
  `IOS_DIST_CERT_PASSWORD`, `IOS_PROFILE_BASE64`, `IOS_TEAM_ID`.

---

## 3. El build (proyecto iOS de Capacitor)

### 3.1 Requisitos de subida

- [X] Compilar con **Xcode 26+ / SDK iOS 26** (obligatorio desde el 28-04-2026).
- [X] Deployment target **iOS 13 o posterior** (obligatorio desde el 09-09-2026).
- [X] `CFBundleShortVersionString` (versión visible, ej. `1.2.0`) y `CFBundleVersion` (build
  number) **mayor que el último subido**: App Store Connect rechaza un build repetido.
- [X] Ícono de 1024×1024 px, PNG **sin transparencia** ni esquinas redondeadas, en el asset
  catalog.
- [X] Launch screen (storyboard), no una imagen estática.
- [X] Orientaciones y familias de dispositivos correctas. Si no se publica para iPad, quitar
  iPad de _Supported Destinations_ (si no, se exigen capturas de iPad).

### 3.2 Info.plist

- [ ] Textos de permiso (`NS…UsageDescription`) para cada permiso que pida la app, claros y
  específicos (ej. `NSLocationWhenInUseUsageDescription` para sucursal cercana,
  `NSCameraUsageDescription` si escanea QR). Un texto genérico es motivo de rechazo.
- [ ] `ITSAppUsesNonExemptEncryption` = `false` si solo usa HTTPS/cifrado del sistema; evita
  responder el cuestionario de exportación en cada build **(verificar en la doc de Xcode)**.
- [ ] `UIBackgroundModes` → `remote-notification` solo si se usan pushes silenciosos.
- [ ] Sin `NSAllowsArbitraryLoads` (ATS) salvo justificación.

### 3.3 Privacy manifest (`PrivacyInfo.xcprivacy`)

Obligatorio desde el 01-05-2024 para subir builds que usen APIs de "motivo obligatorio".

- [ ] Agregar `PrivacyInfo.xcprivacy` al target de la app (Capacitor usa `UserDefaults`, por
  ejemplo vía `@capacitor/preferences`: motivo `CA92.1`) **(verificar los plugins usados)**.
- [ ] Declarar ahí también los tipos de datos recolectados y si hay rastreo (`NSPrivacyTracking`).
- [ ] Revisar que cada SDK de terceros (Firebase, etc.) traiga su propio manifest y firma.
- [ ] En Xcode: _Product → Archive → Generate Privacy Report_ y comparar con las etiquetas de
  privacidad del punto 6.

### 3.4 Calidad mínima antes de subir

- [ ] Sin crashes en un iPhone real; probar con red lenta y sin red.
- [ ] Nada de placeholders, "lorem ipsum", botones muertos ni pantallas "próximamente" (2.1, 2.2).
- [ ] La app aporta más que un sitio web empaquetado (4.2): menú, carrito, seguimiento, puntos,
  push de estado.
- [ ] El push **no** es obligatorio para usar la app (4.5.4, 5.1.2(i)).
- [ ] Respeta safe areas, modo oscuro y tamaños de texto dinámicos.

### 3.5 Subida y TestFlight

- [ ] Archivar y subir (`xcodebuild` / workflow de CI, Xcode Organizer, Transporter o
  `xcrun altool`).
- [ ] Esperar el procesamiento del build (email de Apple).
- [ ] Responder exportación de cifrado si no se puso la clave en el Info.plist.
- [ ] **TestFlight interno**: probar el flujo completo (registro, pedido, pago, seguimiento,
  puntos, push, borrado de cuenta).
- [ ] TestFlight externo (opcional): requiere una revisión beta y una descripción de la beta.

---

## 4. Crear la app en App Store Connect (_Mis apps → +_)

Formulario _Nueva app_:

| Campo              | Valor / límite                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Plataforma         | iOS                                                                                                  |
| Nombre             | 2 a 30 caracteres, único en el App Store                                                            |
| Idioma principal   | El de la marca (Español (México) / Español (España) / Inglés…)                                 |
| Bundle ID          | El del App ID del punto 2 (no cambia después)                                                       |
| SKU                | Interno: letras, números, `-`, `.`, `_`; no puede empezar con signo. Usar el slug de la marca |
| Acceso de usuarios | Acceso total / limitado                                                                              |

---

## 5. Información de la app (nivel app, sirve para todas las versiones)

- [ ] **Nombre** (≤ 30) y **subtítulo** (≤ 30) por idioma.
- [ ] **Categoría principal**: _Comida y bebida_ (Food & Drink). Secundaria opcional
  (ej. _Estilo de vida_).
- [ ] **Derechos de contenido**: declarar si usa contenido de terceros (fotos, marcas) y que se
  tienen los derechos.
- [ ] **Clasificación por edad** (ver punto 7).
- [ ] **URL de política de privacidad** (obligatoria) y _Privacy Choices URL_ (opcional).
- [ ] **Licencia (EULA)**: por defecto aplica el EULA estándar de Apple; para términos propios,
  cargarlos en _App Information → License Agreement_ (ver punto 9.3).
- [ ] **Estado de comerciante (DSA)** de la app (punto 1.3).
- [ ] Declaración de dispositivo médico regulado: no aplica a Comida y bebida.

---

## 6. Privacidad de la app (_App Privacy_ / "etiquetas nutricionales")

Obligatoria para apps nuevas y actualizaciones; se puede editar sin subir un build. Incluye lo
que recolectan los SDK de terceros.

- [ ] Completar el cuestionario _¿Recolectás datos?_ → **Sí**.
- [ ] Por cada tipo de dato: propósito, si está **vinculado al usuario** y si se usa para
  **rastreo**.

Tipos que probablemente aplican a una app de pedidos de Ventea (confirmar contra el código y
los SDK reales):

| Tipo de dato (Apple)                                    | Propósito                                                                       | Vinculado  | Rastreo |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- | ------- |
| Contact Info → Name                                    | App Functionality                                                                | Sí        | No      |
| Contact Info → Email Address                           | App Functionality                                                                | Sí        | No      |
| Contact Info → Phone Number (si se pide)               | App Functionality                                                                | Sí        | No      |
| Contact Info → Physical Address (si hay delivery)      | App Functionality                                                                | Sí        | No      |
| Location → Precise/Coarse (si se usa sucursal cercana) | App Functionality                                                                | Según uso | No      |
| Identifiers → User ID                                  | App Functionality                                                                | Sí        | No      |
| Identifiers → Device ID (token de push)                | App Functionality                                                                | Sí        | No      |
| Purchases → Purchase History                           | App Functionality                                                                | Sí        | No      |
| Usage Data → Product Interaction (si hay analytics)    | Analytics                                                                        | Según SDK | No      |
| Diagnostics → Crash Data (si hay Crashlytics)          | App Functionality                                                                | Según SDK | No      |
| Financial Info → Payment Info                          | **No se recolecta** si la pasarela captura la tarjeta y la app nunca la ve | —         | —      |

- [ ] Si hay **rastreo** (cruzar datos con terceros para publicidad), implementar **App
  Tracking Transparency** y declararlo. Si no, declarar "sin rastreo" en todo.
- [ ] Coherencia: lo declarado acá = privacy manifest = política de privacidad.

---

## 7. Clasificación por edad

Apple renovó el sistema (niveles **4+, 9+, 13+, 16+ y 18+**). Las respuestas al cuestionario
nuevo eran obligatorias desde el 31-01-2026 para poder enviar actualizaciones, y desde
septiembre de 2026 se suman preguntas sobre capacidades de redes sociales.

- [ ] _App Information → Age Rating → Edit_ y responder:
  - [ ] Controles y capacidades dentro de la app (chat, contenido generado por usuarios, acceso
    web sin restricción, controles parentales, verificación de edad, redes sociales).
  - [ ] Contenido: violencia, sexo, lenguaje, drogas/**alcohol**, apuestas, horror, temas
    médicos, con su frecuencia. **Ojo**: si el menú vende alcohol o lo muestra, declararlo
    ("Alcohol, tabaco o drogas") sube la edad.
  - [ ] Opcional: _Age Suitability URL_.
- [ ] Si los términos exigen una edad mínima mayor a la calculada, subir la clasificación
  manualmente (override).
- [ ] Metadatos (textos y capturas) aptos para 4+ aunque la app tenga clasificación mayor (2.3.8).

---

## 8. Ficha de la versión (nivel versión, por idioma)

### 8.1 Textos

| Campo                  | Límite                                 | Obligatorio             | Notas                                                   |
| ---------------------- | --------------------------------------- | ----------------------- | ------------------------------------------------------- |
| Texto promocional      | 170 caracteres                          | No                      | Arriba de la descripción; se cambia sin nueva versión |
| Descripción           | 4.000 caracteres, texto plano           | Sí                     | Base en `store-listing.md`                            |
| Palabras clave         | 100 **bytes**, separadas por coma | Sí                     | Ver 8.2                                                 |
| Novedades (What's New) | 4.000 caracteres                        | Solo en actualizaciones | No existe en la v1                                      |
| URL de soporte         | Con `https://`                        | Sí                     | Debe mostrar contacto real                              |
| URL de marketing       | Con `https://`                        | No                      | Landing de la app                                       |
| Copyright              | `2026 Nombre Legal S.A.`              | Sí                     | Apple agrega el ©                                      |
| Versión               | ej. `1.2.0`                           | —                      | Igual al `CFBundleShortVersionString`                 |

### 8.2 Título, subtítulo y palabras clave (ASO)

- [ ] **Nombre**: marca + función corta si entra (ej. "Carolina Hot Chicken"). Sin palabras
  clave de relleno, precios ni nombres de otras apps (2.3.7).
- [ ] **Subtítulo** (≤ 30): beneficio concreto (ej. "Pedí, seguí tu orden y sumá puntos").
- [ ] **Keywords** (100 bytes; los acentos ocupan 2 bytes):
  - [ ] Separadas por coma **sin espacios**.
  - [ ] Cada una de más de 2 caracteres.
  - [ ] No repetir palabras que ya están en el nombre o el subtítulo (Apple ya las indexa).
  - [ ] Sin nombres de la competencia ni marcas ajenas.
  - [ ] Ideas: `pollo,frito,picante,delivery,pedidos,comida,restaurante,puntos,promo,ciudad`.
- [ ] Repetir nombre/subtítulo/keywords/descripción por **cada idioma** en que se publique.

### 8.3 Capturas de pantalla

Formato: `.png` o `.jpg`, RGB **sin canal alfa** ni transparencias. De 1 a 10 por tamaño.

| Dispositivo                         | Tamaños aceptados (vertical, px)  | ¿Obligatorio?               |
| ----------------------------------- | ---------------------------------- | ---------------------------- |
| iPhone 6.9" (Dynamic Island grande) | 1320×2868, 1290×2796, 1260×2736 | **Sí** (o el de 6.5") |
| iPhone 6.5"                         | 1284×2778, 1242×2688             | Fallback si falta el de 6.9" |
| iPad 13"                            | 2064×2752, 2048×2732             | Solo si la app corre en iPad |

- [ ] Recomendado: 6 a 10 capturas de 1320×2868; App Store Connect escala al resto.
- [ ] Las 3 primeras venden: se ven en los resultados de búsqueda.
- [ ] Mostrar la app **en uso**, no solo login ni splash (2.3.3): menú, producto, carrito,
  seguimiento del pedido, puntos, sucursales.
- [ ] Datos ficticios, sin datos personales reales (2.3.9).
- [ ] Texto de marketing encima de cada captura, legible en el tamaño de la búsqueda.
- [ ] Sin marcos de otros dispositivos (Android) ni precios que puedan quedar viejos.
- [ ] Versión por idioma si el texto de las capturas cambia.

### 8.4 Vista previa en video (opcional)

- [ ] Hasta 3 por tamaño e idioma, de 15 a 30 segundos, máximo 500 MB.
- [ ] H.264 (`.mov`, `.m4v`, `.mp4`, 30 fps máx.) o ProRes 422 HQ. Audio AAC estéreo.
- [ ] iPhone con Dynamic Island: 886×1920 (vertical); iPad 13": 1200×1600.
- [ ] Solo capturas de video de la app misma (2.3.4), sin manos ni personas.

### 8.5 Build y opciones de publicación

- [ ] Elegir el build procesado en la versión.
- [ ] Publicación: **manual**, automática apenas se apruebe, o automática desde una fecha.
- [ ] _Phased release_ (7 días, opcional) para actualizaciones.
- [ ] **Precio y disponibilidad**: gratis; elegir países (si el restaurante opera en un solo
  país, limitar a ese país evita reseñas y soporte de afuera).

---

## 9. Páginas web y textos legales

Todas públicas, con HTTPS, sin login, en el idioma de la ficha, con la marca del restaurante.

### 9.1 Política de privacidad (obligatoria)

URL en la ficha **y** enlace dentro de la app (registro y perfil). Debe decir (5.1.1(i)):

- [ ] Quién es el responsable (razón social, dirección, contacto).
- [ ] Qué datos se recolectan y para qué (coherente con el punto 6).
- [ ] Con quién se comparten (pasarela de pago, Firebase/Google, hosting, Ventea como
  proveedor) y que esos terceros dan la misma protección.
- [ ] Cuánto tiempo se guardan y cómo se borran.
- [ ] Cómo **borrar la cuenta** y revocar el consentimiento (y qué datos se conservan por ley,
  ej. facturas).
- [ ] Derechos según la ley local (ARCO / GDPR / CCPA según el país).
- [ ] Uso de notificaciones push y de ubicación, si aplica.
- [ ] Fecha de última actualización.

### 9.2 Página de soporte (obligatoria)

- [ ] Email y/o teléfono o WhatsApp de atención, horarios.
- [ ] Preguntas frecuentes: pedidos, pagos, reembolsos, puntos, cuenta.
- [ ] Enlace a cómo borrar la cuenta.

### 9.3 Términos y condiciones (EULA)

Apple aplica su **EULA estándar** si no se carga uno propio. Para una app con pagos y puntos,
conviene uno propio:

- [ ] Uso de la app y de la cuenta, edad mínima.
- [ ] Pedidos, precios, pagos, cancelaciones y reembolsos (los gestiona el restaurante).
- [ ] **Programa de puntos**: cómo se ganan, vencimiento, que no tienen valor en efectivo, que
  no se compran con dinero (si no, serían compra in-app, guía 3.1.1).
- [ ] Promociones y cupones.
- [ ] Responsabilidad del restaurante por menú, alérgenos y entrega.
- [ ] Ley aplicable y jurisdicción.
- [ ] Si se carga un EULA propio, debe incluir los términos mínimos que Apple exige a los
  EULA personalizados (Apple es tercero beneficiario, no da soporte, etc.)
  **(verificar en _Instructions for Minimum Terms of Developer's EULA_)**.
- [ ] Enlace a los términos dentro de la app (registro).

### 9.4 Página de marketing (opcional, recomendada)

- [ ] Landing con nombre, beneficios, capturas y badge oficial "Download on the App Store"
  (usar el badge de Apple Marketing Resources, sin modificarlo).
- [ ] Smart App Banner en el sitio del restaurante:
  `<meta name="apple-itunes-app" content="app-id=XXXXXXXXX">`.
- [ ] Enlaces a privacidad, términos y soporte.

---

## 10. Requisitos funcionales que revisa Apple

- [ ] **Borrado de cuenta dentro de la app** (5.1.1(v)): desde el perfil, que borre la cuenta
  y sus datos (no solo desactivarla). Si hay pasos fuera de la app, explicarlos.
- [ ] **No exigir registro** para lo que no lo necesita: dejar ver el menú sin cuenta
  (5.1.1(v)).
- [ ] **Sign in with Apple** (4.8): si hay login con Google/Facebook como opción principal,
  ofrecer también una opción equivalente que limite los datos a nombre y email y permita
  ocultar el email (Sign in with Apple cumple). Email + contraseña propio no lo exige.
- [ ] **Pagos** (3.1.3(e)): comida y bienes físicos se cobran con pasarela propia o Apple Pay,
  **nunca** con compra in-app. Los puntos que se ganan comprando comida no son IAP.
- [ ] **Push** (4.5.4): no obligatorio; si se mandan promociones, pedir consentimiento
  explícito y dar opción de darse de baja dentro de la app.
- [ ] Permisos (5.1.2(i)): no condicionar puntos ni funciones a aceptar push, ubicación o
  rastreo.
- [ ] Enlaces a privacidad y soporte accesibles dentro de la app (1.5).
- [ ] Contenido generado por usuarios (1.2): solo si hay reseñas/comentarios públicos; en ese
  caso, filtro, reporte, bloqueo y contacto.

---

## 11. Formulario de revisión (_App Review Information_)

- [ ] **Credenciales**: usuario y contraseña de una cuenta de prueba que **no venza**, con
  puntos y datos de ejemplo cargados. Sin 2FA ni código por SMS a un teléfono real (o
  explicar cómo pasarlo).
- [ ] **Backend en producción encendido** y con la sucursal "abierta" durante la revisión, o
  explicar cómo probar un pedido fuera de horario.
- [ ] **Contacto**: nombre, email y teléfono con formato internacional (`+52…`).
- [ ] **Notas** (hasta 4.000 bytes):
  - [ ] Qué hace la app y que es la **app oficial del restaurante** (guía 4.2.6, apps de
    plantilla; texto base en `store-listing.md`).
  - [ ] Cómo hacer un pedido de prueba sin pagar de verdad (tarjeta de prueba o modo test).
  - [ ] Para qué se usa cada permiso.
  - [ ] Que los pagos son por bienes físicos (3.1.3(e)).
- [ ] Adjunto opcional: video de la app mostrando el flujo, si es difícil de probar.
- [ ] **4.2.6**: enviar desde la cuenta del **dueño del contenido** (restaurante,
  `publisher = client`). Ver la decisión en `docs/white-label.md`.

---

## 12. Cumplimiento extra

- [ ] **Exportación de cifrado**: responder (o usar `ITSAppUsesNonExemptEncryption`). Si la app
  usa cifrado propio no exento, puede necesitar documentación (y para Francia, declaración).
- [ ] **Accessibility Nutrition Labels**: hoy voluntarias; Apple las hará obligatorias "con el
  tiempo". Si no se completan, la ficha (iOS 26+) dice que no se indicó soporte.
- [ ] Leyes locales de protección al consumidor (precios con impuestos, info de alérgenos si
  la ley lo pide).

---

## 13. Envío y después

- [ ] _Agregar para revisión_ → _Enviar a revisión de apps_.
- [ ] Revisar el estado (_Esperando revisión → En revisión → Lista para distribución_).
- [ ] Si rechazan: responder en el **Resolution Center**, corregir y reenviar; apelar solo con
  argumentos de las guías.
- [ ] Si la publicación es manual, presionar _Publicar esta versión_.
- [ ] Guardar el enlace de la app (`https://apps.apple.com/app/idXXXXXXXXX`) en la plataforma:
  `status: published` y `storeUrls.ios`.
- [ ] Probar la descarga desde el App Store en un iPhone limpio.
- [ ] Configurar respuestas a reseñas y, si se quiere, eventos in-app y páginas de producto
  personalizadas.
- [ ] Renovar la membresía de developer cada año (si vence, la app sale de la tienda).

---

## Fuentes

Documentación oficial de Apple consultada el 2026-11-27:

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications)
- [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)
- [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf)
- [Age rating questionnaire now includes social media questions](https://developer.apple.com/news?id=tlur8uvi)
- [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance)
- [EU Digital Services Act trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements)
- [Overview of Accessibility Nutrition Labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels)
