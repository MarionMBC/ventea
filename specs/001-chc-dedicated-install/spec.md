# Feature Specification: Instalación dedicada de Carolina Hot Chicken

**Feature Branch**: `main` (sin rama propia: especificación del estado ya desplegado)

**Created**: 2026-11-10

**Status**: Draft (spec retroactiva para auditar huecos)

**Input**: User description: "Carolina Hot Chicken en su propia VPS (api.carolinahotchicken.com y fe.carolinahotchicken.com), con los datos de la instalación anterior, app Android build 13 en prueba interna de Play y distribuida por App Tester; encontrar agujeros."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El cliente pide desde la app y el pedido llega al local (Priority: P1)

Un cliente de Carolina Hot Chicken abre la app Android, ve el menú con fotos, arma un pedido, lo envía y sigue su estado en vivo hasta que se lo entregan. Suma puntos de lealtad.

**Why this priority**: es el negocio. Si un pedido se pierde o cae en el servidor equivocado, el local no lo ve y el cliente se queda sin comida.

**Independent Test**: instalar la app desde la prueba interna, hacer un pedido real y verlo en el panel del local en menos de 10 segundos.

**Acceptance Scenarios**:

1. **Given** la app instalada (cualquier build en manos de clientes o testers), **When** el cliente envía un pedido, **Then** el pedido aparece en el panel del local de la instalación dedicada, y en ningún otro lado.
2. **Given** un pedido en curso, **When** el local cambia su estado, **Then** el cliente recibe la notificación push y ve el estado nuevo.
3. **Given** el servidor caído, **When** el cliente intenta pedir, **Then** ve un mensaje claro y el equipo se entera de la caída sin que se lo diga un cliente.

---

### User Story 2 - El local administra menú y pedidos desde la web (Priority: P1)

El personal del local entra al panel web en `fe.carolinahotchicken.com/admin`, gestiona menú, precios, fotos y pedidos.

**Why this priority**: sin panel no hay operación.

**Independent Test**: entrar al panel, cambiar el precio de un ítem y ver el precio nuevo en la app.

**Acceptance Scenarios**:

1. **Given** un empleado con cuenta, **When** inicia sesión, **Then** entra al panel; **When** alguien prueba claves al azar, **Then** el sistema lo frena.
2. **Given** un empleado que olvidó la clave, **When** pide recuperarla, **Then** recibe un correo para restablecerla.

---

### User Story 3 - Los datos del negocio sobreviven a cualquier falla (Priority: P1)

Pedidos, clientes, puntos, menú y fotos se pueden recuperar si el servidor se rompe, se borra o se hackea.

**Why this priority**: los puntos de lealtad y el historial son deuda con el cliente; perderlos es perder confianza y dinero.

**Independent Test**: restaurar la copia más reciente en un servidor limpio y verificar que el menú, los pedidos y los puntos coinciden.

**Acceptance Scenarios**:

1. **Given** un día normal de operación, **When** el disco del servidor se pierde, **Then** se recupera todo salvo, como máximo, las últimas 24 horas.
2. **Given** un despliegue nuevo que falla, **When** se revierte, **Then** vuelve la versión anterior en menos de 15 minutos sin perder datos.

---

### User Story 4 - La app llega a la tienda pública (Priority: P2)

Carolina Hot Chicken aparece en Google Play para cualquier cliente.

**Why this priority**: hoy solo la ven testers internos; sin tienda pública no hay clientes nuevos por la app.

**Independent Test**: buscar la app en Play desde un teléfono sin invitación.

**Acceptance Scenarios**:

1. **Given** la app en prueba interna, **When** se completan ficha, política de privacidad, seguridad de datos y la prueba cerrada exigida, **Then** Google aprueba la publicación en producción.

---

### Edge Cases

- Clientes con builds viejos (hasta 12) apuntan al servidor anterior: sus pedidos no llegan al local nuevo.
- Las dos instalaciones (anterior y dedicada) siguen vivas con datos que divergen desde el corte.
- El servidor es compartido con otras apps del mismo dueño: una de ellas puede agotar memoria o disco y tumbar a Carolina.
- Se vence el certificado o cambia el DNS de un subdominio.
- Las credenciales de notificaciones push no coinciden con la clave nueva y los push fallan en silencio.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda versión de la app en manos de clientes o testers MUST enviar sus pedidos a la instalación dedicada; la instalación anterior MUST dejar de aceptar pedidos o redirigir a la nueva.
- **FR-002**: El panel del local MUST exigir inicio de sesión y MUST frenar intentos repetidos de adivinar claves.
- **FR-003**: Los empleados MUST poder recuperar su clave por correo.
- **FR-004**: El sistema MUST notificar al cliente cada cambio de estado de su pedido.
- **FR-005**: Pedidos, clientes, puntos, menú y fotos MUST respaldarse al menos una vez al día fuera del servidor, y la restauración MUST estar probada.
- **FR-006**: Cada despliegue MUST identificar la versión que quedó corriendo y su punto de reversión.
- **FR-007**: Una caída del servicio MUST avisar al equipo en minutos.
- **FR-008**: El panel de administración del servidor MUST ser accesible solo por canal cifrado y por personas autorizadas.
- **FR-009**: Las claves y credenciales del proyecto MUST guardarse fuera de archivos de texto plano compartidos, y toda clave expuesta MUST rotarse.
- **FR-010**: La app MUST tener una política de privacidad pública, accesible por URL, antes de pedir producción en Play.
- **FR-011**: Los clientes de Carolina MUST tener recursos garantizados frente a las otras apps del mismo servidor.
- **FR-012**: Las imágenes (menú, logo, ícono y toda foto subida) MUST guardarse en un almacenamiento de objetos propio de Carolina (MinIO) administrado desde Dokploy, no en el disco del contenedor de la API.
- **FR-013**: Al reemplazar una imagen (por ejemplo, la foto de un ítem), el sistema MUST borrar la imagen anterior y sus variantes (miniatura) del almacenamiento, salvo que otra entidad la siga usando.
- **FR-014**: Al borrar un ítem del menú, su imagen MUST borrarse también si nadie más la usa. Quitar la foto de un ítem (dejarlo sin foto) NO la borra: queda en la biblioteca para volver a usarla.

### Key Entities

- **Pedido**: cliente, ítems, total, estado, historial de estados.
- **Cliente**: identidad, dispositivo para push, puntos de lealtad.
- **Ítem de menú**: categoría, precio, foto.
- **Versión desplegada**: código, artefacto, fecha, punto de reversión.
- **Respaldo**: fecha, contenido, ubicación externa, última restauración probada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % de los pedidos enviados desde cualquier build en circulación aparecen en el panel dedicado en menos de 10 s.
- **SC-002**: Pérdida máxima de datos ante una falla total: 24 h; tiempo de recuperación: menos de 4 h.
- **SC-003**: El equipo se entera de una caída en menos de 5 minutos.
- **SC-004**: Después de 10 claves erróneas seguidas, la cuenta o la IP quedan frenadas al menos 15 minutos.
- **SC-005**: 0 credenciales del proyecto viajan sin cifrar o viven en texto plano compartido.
- **SC-006**: La app pasa la revisión de producción de Play al primer intento.

## Assumptions

- Carolina Hot Chicken opera un solo local (instalación single-tenant).
- La cuenta de Play es ONCORP (personal): producción exige prueba cerrada con 12 testers durante 14 días.
- Los pagos son manuales (sin tarjeta en la app).
- El servidor 158.220.99.142 se comparte con otras apps del mismo dueño (store, minio, Tienda en línea).
- La instalación anterior (`carolina-hot-chicken.ventea.tech`) sigue encendida hasta que se decida apagarla.
