# Marca blanca

Cómo el mismo código llega a la tienda de aplicaciones con la cara de cada cliente.

## Web: una instancia por cliente

El menú público y el panel se sirven desde el VPS del propio cliente, bajo su dominio
(ver [deployment.md](deployment.md)). El branding (`TenantBranding`) llega en la
respuesta de la API y se aplica como variables CSS en tiempo de ejecución, así que la
misma imagen de contenedor se ve distinta en cada instalación:

```
pedidos.carolinahotchicken.cl  →  rojo, logo de Carolina
pedidos.otramarca.cl           →  azul, logo de la otra marca
```

Cliente nuevo = un despliegue en su VPS + el `INSERT` del tenant. Si en algún momento se
alojan clientes chicos juntos en una instancia nuestra (`TENANT_MODE=multi`), ahí sí
alcanza con el `INSERT` y un subdominio.

## Nativo: un binario por marca

Acá no hay atajo. Las tiendas exigen un bundle id propio, y el ícono y el nombre se
compilan dentro del artefacto:

| Qué                 | Fuente                                                |
| ------------------- | ----------------------------------------------------- |
| `appId` (bundle id) | `VENTEA_APP_ID` — ej. `app.ventea.carolina`           |
| Nombre visible      | `VENTEA_APP_NAME`                                     |
| Tenant fijo         | `VITE_DEFAULT_TENANT_SLUG` (viaja en `X-Tenant-Slug`) |
| Colores             | `VITE_*` de branding, inyectados al build             |
| Ícono y splash      | assets por marca, resueltos antes de `cap sync`       |

`capacitor.config.ts` ya lee esas variables. El pipeline por marca queda por armar:

1. Leer el branding del tenant desde la API
2. Escribir el `.env` de build y copiar los assets de marca
3. `npm run build -w @ventea/mobile && npx cap sync`
4. Firmar con el keystore/certificado **de ese cliente** y publicar en su cuenta

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
