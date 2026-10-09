#!/usr/bin/env node
/**
 * Regresión de layout del panel (TASK-020): recorre cada pantalla en varios viewports e
 * idiomas con Playwright y verifica la regla de scroll de `apps/admin/LAYOUT.md`:
 *
 *   1. Sin desborde horizontal: `scrollWidth <= innerWidth`.
 *   2. Un solo scroll vertical principal: como mucho un elemento (o el documento) con barra
 *      vertical visible, sin contar paneles independientes marcados `data-scroll-pane` (las
 *      columnas del tablero, la barra lateral) ni lo que está dentro de un diálogo abierto.
 *      Un panel no fijo no puede estar dentro de algo que también scrollea (eso es la doble
 *      barra).
 *   3. Diálogos (editor de ítem, de grupo): el fondo no scrollea mientras están abiertos,
 *      el cuerpo tiene scroll propio y el último campo se alcanza sin quedar tapado por el pie.
 *   4. Formularios con barra de guardado fija: el último campo se alcanza y queda encima de
 *      la barra.
 *
 * No entra en `npm test` (necesita la API, una base con datos y un Chromium). Se corre contra
 * un servidor local:
 *
 *   ADMIN_URL=http://127.0.0.1:5174/admin \
 *   STAFF_EMAIL=owner@carolina-hot-chicken.test STAFF_PASSWORD=devpassword \
 *   PLATFORM_EMAIL=… PLATFORM_PASSWORD=… \
 *   npm run test:layout -w @ventea/admin
 *
 * Playwright no es dependencia del repo: se toma `playwright` si está instalado o la ruta de
 * `PLAYWRIGHT_MODULE` (p. ej. `/ruta/node_modules/playwright`). `SCREENSHOT_DIR` guarda una
 * captura por pantalla; `VIEWPORTS=1280x800,390x844` y `LANGS=es` acotan la corrida.
 * Sin `PLATFORM_EMAIL` se saltan las pantallas de plataforma. Sale con 1 si algo falla.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const env = process.env;
const BASE = (env.ADMIN_URL ?? 'http://127.0.0.1:5174/admin').replace(/\/$/, '');
const VIEWPORTS = (env.VIEWPORTS ?? '1280x800,1440x900,768x1024,390x844').split(',').map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { width, height, name: v };
});
const LANGS = (env.LANGS ?? 'es,en').split(',');
const SHOTS = env.SCREENSHOT_DIR ? path.resolve(env.SCREENSHOT_DIR) : null;

async function loadPlaywright() {
  if (env.PLAYWRIGHT_MODULE) {
    const entry = path.join(env.PLAYWRIGHT_MODULE, 'index.js');
    return import(pathToFileURL(entry).href);
  }
  try {
    return await import('playwright');
  } catch {
    console.error('Falta Playwright: instalalo o definí PLAYWRIGHT_MODULE.');
    process.exit(2);
  }
}

/** Corre en la página: mide desbordes y contenedores con scroll. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.scrollingElement ?? document.documentElement;
  const describe = (el) => {
    if (el === doc) return 'document';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
  };
  const inDialog = (el) => Boolean(el.closest('[aria-modal="true"], [role="dialog"], .drawer'));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  const htmlStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  const docLocked = [htmlStyle.overflowY, bodyStyle.overflowY].some(
    (v) => v === 'hidden' || v === 'clip',
  );
  const docScrolls = !docLocked && doc.scrollHeight > vh + 1;

  const scrollers = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.overflowY !== 'auto' && s.overflowY !== 'scroll') continue;
    if (el.scrollHeight <= el.clientHeight + 1 || !visible(el)) continue;
    scrollers.push(el);
  }

  const panes = scrollers.filter((el) => el.closest('[data-scroll-pane]'));
  const dialogs = scrollers.filter((el) => !panes.includes(el) && inDialog(el));
  const main = scrollers.filter((el) => !panes.includes(el) && !dialogs.includes(el));
  const problems = [];

  const mainNames = [...(docScrolls ? ['document'] : []), ...main.map(describe)];
  if (mainNames.length > 1) problems.push(`doble scroll: ${mainNames.join(' + ')}`);

  for (const pane of panes) {
    const fixed = ['sticky', 'fixed'].includes(
      getComputedStyle(pane.closest('[data-scroll-pane]')).position,
    );
    const outer = main.find((el) => el !== pane && el.contains(pane));
    if (outer) problems.push(`scroll anidado: ${describe(pane)} dentro de ${describe(outer)}`);
    else if (docScrolls && !fixed) problems.push(`scroll anidado: ${describe(pane)} y document`);
  }

  if (doc.scrollWidth > vw + 1) {
    // Los que se salen por la derecha sin una caja con scroll lateral que los contenga.
    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      if (culprits.length >= 5) break;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width === 0) continue;
      let contained = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          contained = true;
          break;
        }
      }
      if (!contained) culprits.push(describe(el));
    }
    problems.push(`desborde horizontal ${doc.scrollWidth}>${vw}: ${culprits.join(', ')}`);
  }

  return { problems, docScrolls, scrollers: mainNames, panes: panes.map(describe) };
}

/** Corre en la página con un diálogo abierto: fondo bloqueado, cuerpo con scroll, último campo. */
function measureDialog() {
  const problems = [];
  const panel = document.querySelector('[aria-modal="true"]');
  if (!panel) return { problems: ['no se abrió el diálogo'] };
  const doc = document.scrollingElement ?? document.documentElement;
  const before = doc.scrollTop;
  doc.scrollTop = before + 200;
  const moved = doc.scrollTop !== before;
  doc.scrollTop = before;
  const html = getComputedStyle(document.documentElement).overflowY;
  const body = getComputedStyle(document.body).overflowY;
  const locked = [html, body].some((v) => v === 'hidden' || v === 'clip');
  if (moved && !locked) problems.push('el fondo scrollea con el diálogo abierto');
  // Otros contenedores del fondo con scroll y sin bloquear.
  for (const el of document.querySelectorAll('body *')) {
    if (panel.contains(el) || el.contains(panel)) continue;
    const s = getComputedStyle(el);
    if (
      (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      if (!el.closest('[data-scroll-pane]'))
        problems.push(`fondo con scroll propio: ${el.className}`);
    }
  }
  const body2 = panel.querySelector('.drawer__body') ?? panel;
  if (body2.scrollWidth > body2.clientWidth + 1) {
    problems.push(
      `desborde horizontal dentro del diálogo (${body2.scrollWidth}>${body2.clientWidth})`,
    );
  }
  body2.scrollTop = body2.scrollHeight;
  const fields = [...body2.querySelectorAll('input, select, textarea, button')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const last = fields.at(-1);
  const foot = panel.querySelector('.drawer__foot');
  if (last) {
    const r = last.getBoundingClientRect();
    const limit = foot ? foot.getBoundingClientRect().top : window.innerHeight;
    if (r.bottom > limit + 1)
      problems.push(`último campo tapado (${Math.round(r.bottom)}>${Math.round(limit)})`);
  }
  if (panel.getBoundingClientRect().right > window.innerWidth + 1)
    problems.push('el diálogo se sale por la derecha');
  return { problems };
}

/** Cajón de navegación (móvil y tablet): fondo bloqueado y el cajón entra en pantalla. */
function measureNavDrawer() {
  const problems = [];
  const nav = document.querySelector('#app-sidebar');
  const html = getComputedStyle(document.documentElement).overflowY;
  const body = getComputedStyle(document.body).overflowY;
  const doc = document.scrollingElement ?? document.documentElement;
  const locked = [html, body].some((v) => v === 'hidden' || v === 'clip');
  if (!locked && doc.scrollHeight > window.innerHeight + 1) {
    problems.push('el fondo scrollea con el cajón de navegación abierto');
  }
  const r = nav.getBoundingClientRect();
  if (r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1) {
    problems.push('el cajón de navegación se sale de la pantalla');
  }
  return { problems };
}

/** Último campo de un formulario con barra fija (`.savebar`): alcanzable y encima de la barra. */
function measureSavebar() {
  const bar = document.querySelector('.savebar');
  if (!bar) return { problems: [] };
  const doc = document.scrollingElement ?? document.documentElement;
  const form = bar.closest('form') ?? document.querySelector('main');
  const fields = [...form.querySelectorAll('input, select, textarea')].filter((el) => {
    if (bar.contains(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const last = fields.at(-1);
  if (!last) return { problems: [] };
  // Todo lo que scrollea alrededor del campo, hasta el fondo: así lo vería quien llega al final.
  for (let p = last.parentElement; p; p = p.parentElement) p.scrollTop = p.scrollHeight;
  doc.scrollTop = doc.scrollHeight;
  const r = last.getBoundingClientRect();
  const top = bar.getBoundingClientRect().top;
  return r.bottom > top + 1
    ? {
        problems: [
          `último campo tapado por la barra de guardado (${Math.round(r.bottom)}>${Math.round(top)})`,
        ],
      }
    : { problems: [] };
}

async function login(page, url, email, password) {
  await page.goto(url);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(250);
}

async function main() {
  const playwright = await loadPlaywright();
  const chromium = playwright.chromium ?? playwright.default.chromium;
  const browser = await chromium.launch();
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const failures = [];
  let checks = 0;

  const staff = env.STAFF_EMAIL ?? 'owner@carolina-hot-chicken.test';
  const staffPass = env.STAFF_PASSWORD ?? 'devpassword';
  const platform = Boolean(env.PLATFORM_EMAIL);

  // Un solo login por corrida (la API limita los intentos por hora); las sesiones viven en
  // localStorage y se reutilizan en cada viewport.
  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  await login(setupPage, `${BASE}/login`, staff, staffPass);
  await setupPage.waitForSelector('.app__main');
  if (platform) {
    await login(
      setupPage,
      `${BASE}/plataforma/login`,
      env.PLATFORM_EMAIL,
      env.PLATFORM_PASSWORD ?? '',
    );
    await setupPage.waitForURL(/\/plataforma\/?$/);
  }
  const auth = await setup.storageState();
  await setup.close();

  for (const lang of LANGS) {
    for (const vp of VIEWPORTS) {
      const open = async (storageState) => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          storageState,
        });
        await context.addInitScript((l) => {
          try {
            window.localStorage.setItem('ventea.admin.lang', l);
          } catch {
            /* sin almacenamiento */
          }
        }, lang);
        return { context, page: await context.newPage() };
      };
      // Sin sesión: las pantallas de login.
      let { context, page } = await open(undefined);

      const record = async (screen, result) => {
        checks++;
        const tag = `${screen} @ ${vp.name} ${lang}`;
        if (SHOTS) {
          const file = `${screen.replace(/[^a-z0-9]+/gi, '-')}-${vp.name}-${lang}.png`;
          await page.screenshot({ path: path.join(SHOTS, file) });
        }
        if (result.problems.length) {
          failures.push(`${tag}: ${result.problems.join(' | ')}`);
          console.log(`FAIL ${tag}\n     ${result.problems.join('\n     ')}`);
        } else {
          console.log(`ok   ${tag}`);
        }
      };

      await page.goto(`${BASE}/login`);
      await settle(page);
      await record('login', await page.evaluate(measure));
      if (platform && lang === LANGS[0]) {
        await page.goto(`${BASE}/plataforma/login`);
        await settle(page);
        await record('plataforma-login', await page.evaluate(measure));
      }
      await context.close();

      // Con sesión: cada pantalla del restaurante.
      ({ context, page } = await open(auth));
      for (const [screen, route] of [
        ['pedidos', '/orders'],
        ['historial', '/orders/history'],
        ['menu', '/menu'],
        ['mi-marca', '/brand'],
        ['facturacion', '/facturacion'],
      ]) {
        await page.goto(`${BASE}${route}`);
        await settle(page);
        const result = await page.evaluate(measure);
        if (screen === 'mi-marca')
          result.problems.push(...(await page.evaluate(measureSavebar)).problems);
        await record(screen, result);
      }

      // Menú: editor de ítem y de grupo de modificadores.
      await page.goto(`${BASE}/menu`);
      await settle(page);
      await page.locator('.item-row__name--button').first().click();
      await settle(page);
      await record('menu-editor-item', await page.evaluate(measureDialog));
      await page.keyboard.press('Escape');
      await page.locator('#menu-tab-groups').click();
      await settle(page);
      await record('menu-modificadores', await page.evaluate(measure));
      await page.locator('.group-card__actions button').first().click();
      await settle(page);
      await record('menu-editor-grupo', await page.evaluate(measureDialog));
      await page.keyboard.press('Escape');
      // Confirmación de borrado (se cancela: no cambia datos).
      await page.locator('#menu-tab-items').click();
      await settle(page);
      await page.locator('.menu-cat__actions .icon-btn--danger').first().click();
      await settle(page);
      await record('menu-confirmar-borrado', await page.evaluate(measureDialog));
      await page.keyboard.press('Escape');

      // Cajón de navegación (menos de 1024 px).
      if (vp.width < 1024) {
        await page.locator('.topbar .icon-btn').first().click();
        await settle(page);
        await record('cajon-navegacion', await page.evaluate(measureNavDrawer));
        await page.keyboard.press('Escape');
      }

      // Plataforma (en español; el idioma no aplica).
      if (platform && lang === LANGS[0]) {
        const slug = env.PLATFORM_SLUG ?? 'carolina-hot-chicken';
        for (const [screen, route] of [
          ['plataforma-marcas', '/plataforma'],
          ['plataforma-apps', '/plataforma/apps'],
          ['plataforma-embudo', '/plataforma/embudo'],
          ['plataforma-marca', `/plataforma/marcas/${slug}`],
          ['plataforma-app', `/plataforma/marcas/${slug}/app`],
        ]) {
          await page.goto(`${BASE}${route}`);
          await settle(page);
          await record(screen, await page.evaluate(measure));
        }
      }
      await context.close();
    }
  }

  await browser.close();
  console.log(`\n${checks - failures.length}/${checks} pantallas sin problemas de layout.`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
