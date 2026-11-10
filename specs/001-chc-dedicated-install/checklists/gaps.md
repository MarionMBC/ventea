# Checklist de huecos: Instalación dedicada de Carolina Hot Chicken

**Purpose**: huecos entre `spec.md` y lo desplegado, verificados contra el sistema real el 2026-11-10.
**Created**: 2026-11-10
**Feature**: [spec.md](../spec.md)

Marcado: `[x]` cumplido y verificado · `[ ]` hueco abierto (evidencia y severidad al lado).

## Datos y continuidad

- [ ] CHK001 Respaldo diario fuera del servidor (FR-005, SC-002). **CRÍTICO**. Dokploy: `carolina-prod` con 0 backups, 0 backups de volumen, 0 destinos S3. Postgres, el volumen `media` y el volumen `minio` viven solo en el disco de la VPS.
- [ ] CHK002 Una sola instalación recibe pedidos (FR-001, SC-001). **CRÍTICO**. `carolina-hot-chicken.ventea.tech/api/health` sigue respondiendo 200: los builds ≤ 12 (prueba interna anterior, App Tester anterior) mandan pedidos al servidor viejo y la base diverge.
- [ ] CHK003 Reversión probada en menos de 15 min (US3/AC2). **ALTO**. Volver a `ventea-api:e94c1bb` (driver disco) no ve las imágenes subidas después del cambio a MinIO; Dokploy tiene limpieza automática de imágenes Docker (`enableDockerCleanup`), así que la imagen anterior puede no estar.
- [x] CHK004 Imágenes en MinIO propio en Dokploy (FR-012). API `f67472d`, bucket privado `carolina-media`, 4/4 fotos del menú servidas desde MinIO.
- [x] CHK005 Reemplazar una imagen borra la anterior y su miniatura si nadie más la usa (FR-013, FR-014). e2e verdes en disco y contra MinIO.

## Seguridad

- [ ] CHK006 Panel de Dokploy solo por canal cifrado (FR-008, SC-005). **CRÍTICO**. `http://158.220.99.142:3000` abierto en HTTP plano; el host configurado `dokploy.iwastorehn.com` no resuelve en DNS, así que la clave del panel y el token de la API viajan sin cifrar.
- [ ] CHK007 Freno a claves adivinadas en el login (FR-002, SC-004). **ALTO**. La API no tiene rate limit en `POST /api/auth/login` ni en el login del personal (no hay throttler; el `RateLimitGuard` existe pero solo cubre medios y alta de plataforma).
- [ ] CHK008 Credenciales fuera de texto plano y rotadas (FR-009). **ALTO**. Las contraseñas de la VPS y el token de Dokploy están en `AgroTrace/keys.txt`; en esta sesión se expusieron secretos de otros proyectos (token Dokploy AgroTrace, app password de Google, clave n8n, clave VIAJU): rotarlos.
- [ ] CHK009 SSH endurecido. **MEDIO**. Puerto 22 abierto con login por contraseña.
- [ ] CHK010 Superficie de otras apps del servidor. **MEDIO**. Puerto 9000 (MinIO de la tienda) abierto al público en la misma VPS.

## Operación

- [ ] CHK011 Aviso de caída en minutos (FR-007, SC-003). **ALTO**. Dokploy: 0 notificaciones configuradas; no hay monitor externo.
- [ ] CHK012 Recursos garantizados frente a las otras apps (FR-011). **MEDIO**. La VPS comparte CPU, memoria y disco con store, minio, minio-dev y «Tienda en linea». Solo la API (768 MB) y MinIO (384 MB) tienen límite de memoria; Postgres y web no.
- [ ] CHK013 Correo de recuperación de clave (FR-003, US2/AC2). **ALTO**. `SMTP_URL` no está configurado: todo correo queda `skipped`.
- [ ] CHK014 Push verificados en la instalación nueva (FR-004, US1/AC2). **MEDIO**. Las credenciales FCM se copiaron con la misma `PUSH_CREDENTIALS_KEY`, pero ningún push se probó punta a punta en el servidor nuevo.
- [x] CHK015 Versión desplegada identificable (FR-006). API `ventea-api:f67472d`, web `ventea-web:e94c1bb-carolina`.

## Play Store

- [ ] CHK016 Política de privacidad pública (FR-010). **ALTO** (bloquea producción). `fe.carolinahotchicken.com/privacy` devuelve la SPA (200 genérico), no una política.
- [ ] CHK017 Testers asignados en prueba interna (US4). **ALTO**. El segmento interno está «Inactivo»: no hay lista de testers.
- [ ] CHK018 Requisitos de producción (SC-006). **MEDIO**. Cuenta personal: hace falta una prueba cerrada con 12 testers durante 14 días, además de la ficha, la sección de seguridad de datos y las capturas.

## Notes

- 18 ítems: 3 cumplidos y 15 huecos (4 críticos, 7 altos, 4 medios).
- No se tocó nada de las otras apps del servidor; CHK010 y CHK012 son para decidir.
