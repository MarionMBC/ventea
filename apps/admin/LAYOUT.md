# Layout del panel: scroll y desbordes

Regla para toda pantalla de `apps/admin` (TASK-020). La verifican `src/styles/layout.test.ts`
(en `npm test`) y `npm run test:layout` (en el navegador, ver abajo).

## Un solo scroll principal: el documento

- El panel scrollea con el **documento**. `main.app__main` no tiene alto fijo ni `overflow`.
  Una pantalla nueva no agrega contenedores con `height: 100vh`/`100dvh` + `overflow: auto`:
  eso es la doble barra.
- **Única excepción: el tablero de pedidos** (`.orders--board`). Desde 768 px el área principal
  llena la pantalla (`.app:has(.orders--board) > .app__main`) y cada columna scrollea sola.
- Un **panel de scroll propio** que convive con el documento (columnas del tablero, barra
  lateral) lleva el atributo `data-scroll-pane` y no puede estar dentro de otro contenedor que
  también scrollee.
- Todo contenedor con `overflow` distinto de `visible` que deba recortar lleva
  `position: relative`: si no, los hijos absolutos (`.sr-only`) escapan del recorte y estiran
  la página (fue la causa de la doble barra en Menú).

## Diálogos y paneles laterales

- Usan `Drawer` (`src/ui/Drawer.tsx`) o `ConfirmDialog`: tienen scroll propio
  (`.drawer__body`, `.pf-dialog`) y bloquean el fondo con `useScrollLock()`
  (`src/ui/scrollLock.ts`). Un modal nuevo hecho a mano también llama a `useScrollLock()`.
- El pie fijo del panel (`.drawer__foot`) va fuera del cuerpo que scrollea: el último campo
  siempre queda por encima.

## Alto de pantalla

- `100dvh`, nunca `100vh` solo: cada `100vh` va seguido de la misma declaración con `100dvh`
  (fallback para navegadores viejos). El test lo exige.

## Desbordes horizontales

- Grillas de una columna: `grid-template-columns: minmax(0, 1fr)` (`.page` ya lo tiene). Con la
  columna implícita `auto`, un texto largo o un botón que no corta ensancha toda la página.
- Hijos de `flex` con texto: `min-width: 0`. Textos que escribe el usuario (nombres,
  descripciones, notas): `overflow-wrap: anywhere`.
- Botones con texto variable (p. ej. «Agregar producto a <categoría>»): `white-space: normal`.
- Tablas anchas: dentro de una caja con `overflow-x: auto` (`.table-wrap`, `.pf-table-wrap`);
  nunca hacen scroll lateral de la página.
- Barras fijas (`.savebar`, `position: sticky; bottom: 0`) van al final del formulario, no
  encima: el último campo tiene que poder verse completo.

## Test en el navegador (`npm run test:layout`)

Recorre login, enlace de invitación, Pedidos, Historial, Menú (árbol, editor de ítem,
modificadores, editor de grupo, confirmación de borrado), Mi marca, Sucursales (y su editor),
Equipo (e invitar), Facturación, el cajón de navegación y la plataforma (marcas,
apps, embudo, detalle de marca y de app) en 1280×800, 1440×900, 768×1024 y 390×844, en ES y
EN. Falla si hay desborde horizontal, más de un scroll vertical principal, un scroll anidado, un
diálogo que deja scrollear el fondo o un último campo tapado.

Necesita el panel corriendo contra una API con datos (cuantos más, mejor: muchos productos,
pedidos y nombres largos) y un Chromium de Playwright (no es dependencia del repo):

```bash
npm run dev -w @ventea/admin   # o vite en otro puerto, con API_PROXY_TARGET
ADMIN_URL=http://127.0.0.1:5174/admin \
STAFF_EMAIL=owner@carolina-hot-chicken.test STAFF_PASSWORD=devpassword \
PLATFORM_EMAIL=<admin de plataforma> PLATFORM_PASSWORD=<su contraseña> \
PLAYWRIGHT_MODULE=/ruta/a/node_modules/playwright \
npm run test:layout -w @ventea/admin
```

Opcionales: `VIEWPORTS=1280x800,390x844`, `LANGS=es`, `SCREENSHOT_DIR=<carpeta>` (una captura
por pantalla). Sin `PLATFORM_EMAIL` se saltan las pantallas de plataforma. Cada pantalla nueva
del panel se agrega a la lista de `scripts/layout-check.mjs`.
