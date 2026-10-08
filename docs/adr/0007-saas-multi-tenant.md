# 0007 — SaaS multi-tenant por suscripción, alojado por nosotros

**Estado**: aceptada · 2026-10-08
**Reemplaza a**: [0006](0006-despliegue-por-cliente.md)

## Contexto

El ADR 0006 partía de un modelo comercial: vender el software e instalarlo en el VPS de
cada cliente. El modelo comercial cambió. Los restaurantes chicos y medianos que son el
mercado no quieren —ni saben— administrar un servidor: quieren pagar una cuota mensual y
que funcione. La competencia (OlaClick, Fudo, Toteat, ChowNow) vende así.

Ventea pasa a ser un **SaaS por suscripción**: el cliente paga un plan y nosotros alojamos
la plataforma, siempre bajo `*.ventea.tech`. Hoy en nuestra VPS; mañana en una VPS por
región.

## Decisión

- **`TENANT_MODE=multi` es el modo de producción.** Una instancia atiende muchas marcas;
  el tenant sale del subdominio `<slug>.ventea.tech` (web y panel) o del header
  `X-Tenant-Slug` (apps nativas). `TENANT_MODE=single` queda para instalaciones dedicadas
  excepcionales (un cliente que exija aislamiento físico por contrato).
- **Suscripción por tenant.** Tres planes en USD, sin comisión por pedido, prueba de 14
  días y el anual a precio de diez meses:

  | Plan   | Mensual | Anual | Sucursales | Incluye                                |
  | ------ | ------- | ----- | ---------- | -------------------------------------- |
  | Básico | $25     | $250  | 1          | pedidos web, panel, puntos             |
  | Pro    | $59     | $590  | 3          | + app propia con marca, dominio propio |
  | Cadena | $129    | $1290 | ilimitadas | + reportes, soporte prioritario        |

  La suscripción (`trialing → active ⇄ past_due → suspended / canceled`) vive en Ventea.
  El cobro recurrente (TASK-005) lo hace `ms-payments`, que es stateless y no gestiona
  suscripciones: Ventea guarda el token de tarjeta y el `networkTransactionId`, agenda los
  cobros, reintenta y suspende. Para los cobros sin CVV se usa el adaptador CyberSource, el
  único que implementa credenciales almacenadas.

- **Suspender no es desactivar.** Una marca suspendida responde `402` en su API pública
  (menú, pedidos), pero su staff puede seguir entrando al panel para pagar. `Tenant.isActive`
  conserva su significado anterior (la marca no existe para nadie: `404`).
- **Registro self-service.** `POST /api/platform/signup` crea la marca completa en prueba.
  Las rutas de Traefik se regeneran por cron cada minuto: una marca nueva queda con
  certificado propio (HTTP-01) en menos de dos minutos sin reiniciar el proxy.
- **Región autoasignada.** El restaurante no elige: la plataforma asigna la región por el
  país del registro (`REGIONS`, JSON). Hoy hay una sola, `hn-1` (la VPS actual). Cada
  tenant guarda su `region`; el router por región y una base por región llegan cuando
  haya una segunda.
- **Administración de la plataforma** con cuentas `PlatformAdmin` y JWT `kind: "platform"`
  sin `tid`, que no abre rutas de tenant (y viceversa).

## Por qué ahora

Sin un modelo de cobro no hay negocio que escalar, y cada instalación por cliente del
ADR 0006 costaba horas de operación que el precio de un restaurante chico no paga. El
código ya estaba preparado: `tenantId` en toda tabla, guard de Prisma y modo `multi`
probado en la VPS de prueba con cuatro marcas.

## Consecuencias

- **Somos responsables de los datos y la disponibilidad de todos los clientes.** Una caída
  nuestra los tumba a todos a la vez. Hace falta monitoreo y un plan de incidentes antes
  de tener clientes pagando.
- **RLS de Postgres es obligatorio antes del primer cliente real con datos** (TASK-007).
  Con muchas marcas en una base, el guard de Prisma (red de seguridad en la aplicación)
  ya no alcanza.
- **Respaldos centralizados y fuera de la VPS.** Un `pg_dump` en el mismo disco no sirve
  si la VPS se pierde; ahora esa VPS es la de todos los clientes.
- Un solo despliegue actualiza a todos: se acaban las versiones divergentes del 0006, pero
  una migración mala afecta a todos. Las migraciones siguen siendo aditivas y con
  respaldo previo.
- **Un certificado por marca tiene techo, y un subdominio con TLS válido sirve para
  suplantar.** Let's Encrypt emite 50 certificados por dominio registrado y semana, y el
  registro es público y sin verificar el email. Mitigación de esta fase:
  - cupo **global** de altas self-service contado en la base (`SIGNUP_WEEKLY_LIMIT`, 25 por
    semana; `SIGNUP_DAILY_LIMIT`, 10 por día): al llenarse, `429 "Registro temporalmente
cerrado, escríbenos"`. Vale entre reinicios y réplicas, a diferencia del rate limit por IP;
  - rate limit por IP (5 por hora) y honeypot;
  - slugs reservados contra suplantación (`login`, `secure`, `pay`, `pagos`, `banco`,
    `account`, `verify`, `soporte`…, todo lo que empiece con `admin` y todo lo que contenga
    `ventea`).

  **Antes de cualquier marketing masivo son requisito**: verificación del email del dueño
  antes de publicar la ruta, y el certificado comodín `*.ventea.tech` por DNS-01 (saca las
  altas del cupo de Let's Encrypt).

- Un tenant con volumen desproporcionado afecta a los demás. La salida prevista es moverlo
  a otra región o a una base propia; `region` ya está en el modelo.
- Los tenants existentes (`carolina-hot-chicken`, `demo-burgers`, `pollos-prueba`,
  `taqueria-demo`) pasan a plan Cadena anual `active` en la migración: nada se suspende.
- **Cobro con tarjeta y PCI (TASK-005).** El alta de tarjeta de esta fase recibe el número en
  la API (alcance PCI DSS SAQ D). Antes de activar `BILLING_MODE=ms-payments` en producción se
  migra a `capture-context` (Microform de CyberSource) para que el PAN no toque la API
  (SAQ A). Hasta entonces el endpoint se niega en producción salvo `ALLOW_RAW_CARD_API=true`
  explícito (ver [deployment.md](../deployment.md#cobro-de-suscripciones)).

## Alternativas descartadas

- **Seguir con una instancia por cliente (0006)**: no cierra con precios de $25–$129 al
  mes; cada alta cuesta horas de un técnico.
- **Base por tenant**: aislamiento total, pero N migraciones y N conexiones; se reserva para
  quien la exija por contrato.
- **Delegar las suscripciones a la pasarela**: PixelPay no las tiene y `ms-payments` no las
  gestiona por diseño. Hacerlas en Ventea deja la lógica (pruebas, cambio de plan,
  suspensión) bajo nuestro control.
- **Certificado comodín por DNS-01**: exige reconfigurar y reiniciar el Traefik compartido
  de la VPS. El cron de rutas logra lo mismo (marca nueva con certificado en ≤ 2 min) sin
  tocarlo.
- **Que el restaurante elija la región**: no sabe qué significa, y elegir mal le da peor
  latencia. Se asigna por país.
