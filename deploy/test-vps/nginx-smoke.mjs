#!/usr/bin/env node
// Prueba de humo del nginx de la imagen web (deploy/Dockerfile.web + deploy/nginx.conf), TASK-014.
//
// Levanta la imagen en un contenedor descartable y le habla por SOCKET CRUDO (node:net), con el
// header Host de cada sitio: así se pueden mandar bytes que curl y los navegadores normalizan
// (`\`, `//`, `%2F%2F`, CR/LF codificado). Comprueba:
//   - páginas del sitio corporativo (EN por defecto, ES bajo /es/) con su `lang`, y 404 por idioma;
//   - redirecciones nuevas (301 con query y `Cache-Control: max-age=86400`) y que ninguna sale
//     del host (`//host`, `/\host`, CR/LF en Location);
//   - que no haya bucles con los 301 que producción ya publicó (507b9b6) y que los navegadores
//     tienen en caché sin vencimiento: se simula la caché vieja + la config nueva;
//   - rutas del SaaS en el apex, www, app. y una marca, sin regresión; headers de seguridad.
//
// Uso (desde la raíz del repo, con Docker):
//   node deploy/test-vps/nginx-smoke.mjs --build            # construye ventea-web:smoke y prueba
//   node deploy/test-vps/nginx-smoke.mjs --image ventea-web:x  # prueba una imagen ya construida
//   opciones: --port 8095 (puerto local), --keep (no borra el contenedor ni la imagen construida)
// Sale con código 1 si algún caso falla. Sin dependencias: Node ≥ 22 y Docker.
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BUILD = args.includes('--build');
const KEEP = args.includes('--keep');
const IMAGE = opt('image', 'ventea-web:smoke');
const PORT = Number(opt('port', '8095'));
const NAME = `ventea-nginx-smoke-${process.pid}`;

const docker = (...cmd) =>
  execFileSync('docker', cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Cuerpo `Transfer-Encoding: chunked` → texto plano (las marcas de tamaño cortan etiquetas). */
function dechunk(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const eol = text.indexOf('\r\n', i);
    if (eol < 0) break;
    const size = Number.parseInt(text.slice(i, eol), 16);
    if (!size) break;
    out += text.slice(eol + 2, eol + 2 + size);
    i = eol + 2 + size + 2;
  }
  return out;
}

/** Pedido HTTP/1.1 con bytes exactos (sin normalizar la ruta). */
function raw(host, target, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, '127.0.0.1');
    const chunks = [];
    socket.setTimeout(5000, () => socket.destroy(new Error(`timeout ${host}${target}`)));
    socket.on('connect', () => {
      socket.write(
        Buffer.concat([
          Buffer.from(`${method} `),
          Buffer.from(target, 'latin1'),
          Buffer.from(` HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`),
        ]),
      );
    });
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('end', () => {
      const text = Buffer.concat(chunks).toString('latin1');
      const [head, ...rest] = text.split('\r\n\r\n');
      const [statusLine, ...lines] = head.split('\r\n');
      const headers = {};
      for (const line of lines) {
        const i = line.indexOf(':');
        const key = line.slice(0, i).trim().toLowerCase();
        headers[key] = headers[key]
          ? `${headers[key]}\n${line.slice(i + 1).trim()}`
          : line.slice(i + 1).trim();
      }
      const body = rest.join('\r\n\r\n');
      resolve({
        status: Number(statusLine.split(' ')[1]),
        headers,
        body: /chunked/i.test(headers['transfer-encoding'] ?? '') ? dechunk(body) : body,
      });
    });
  });
}

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

/** Location resuelta como la resolvería el navegador (WHATWG URL). */
const resolveLocation = (location, base = 'https://ventea.tech/') => new URL(location, base);

async function expectPage(host, path, status, lang) {
  const r = await raw(host, path);
  const gotLang = /<html lang="([a-z]+)"/.exec(r.body)?.[1];
  check(
    `${host}${path} → ${status}${lang ? ` lang=${lang}` : ''}`,
    r.status === status && (!lang || gotLang === lang),
    `got ${r.status} lang=${gotLang}`,
  );
  return r;
}

async function expectRedirect(host, path, status, location, { maxAge = false } = {}) {
  const r = await raw(host, path);
  const ok = r.status === status && r.headers.location === location;
  const cache = r.headers['cache-control'] ?? '';
  check(
    `${host}${path} → ${status} ${location}${maxAge ? ' (max-age=86400)' : ''}`,
    ok && (!maxAge || cache === 'max-age=86400'),
    `got ${r.status} ${JSON.stringify(r.headers.location)} cache=${JSON.stringify(cache)}`,
  );
  return r;
}

async function main() {
  if (BUILD) {
    console.log(`docker build -f deploy/Dockerfile.web -t ${IMAGE} .`);
    execFileSync('docker', ['build', '-f', 'deploy/Dockerfile.web', '-t', IMAGE, '.'], {
      stdio: 'inherit',
    });
  }
  docker('run', '-d', '--rm', '--name', NAME, '-p', `${PORT}:80`, IMAGE);
  try {
    // Docker acepta la conexión antes de que nginx esté listo: se espera un 200 real.
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) {
      try {
        ready = (await raw('ventea.tech', '/')).status === 200;
      } catch {
        // todavía no escucha
      }
      if (!ready) await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw new Error('nginx no respondió 200 en / a tiempo');

    // ── Páginas: EN por defecto, ES bajo /es/, 404 por idioma ─────────────────────────────
    const A = 'ventea.tech';
    await expectPage(A, '/', 200, 'en');
    await expectPage(A, '/privacy', 200, 'en');
    await expectPage(A, '/privacy/', 200, 'en');
    await expectPage(A, '/es/', 200, 'es');
    await expectPage(A, '/es/politica-de-privacidad', 200, 'es');
    await expectPage(A, '/nope', 404, 'en');
    await expectPage(A, '/es/nada', 404, 'es');
    await expectPage(A, '/404.html', 404, 'en');
    await expectPage(A, '/es/404.html', 404, 'es');
    for (const path of ['/enterprise', '/english', '/EN/', '/espanol', '/es-mx']) {
      await expectPage(A, path, 404, 'en');
    }
    // /en/privacy NO redirige (ver bucle abajo): misma página EN, canonical a /privacy.
    for (const path of ['/en/privacy', '/en/privacy/']) {
      const r = await expectPage(A, path, 200, 'en');
      check(
        `${A}${path} canonical → /privacy`,
        r.body.includes('<link rel="canonical" href="https://ventea.tech/privacy" />'),
      );
    }

    // ── Redirecciones de TASK-014 (301 + query + max-age de 1 día) ────────────────────────
    const R = { maxAge: true };
    await expectRedirect(A, '/en', 301, '/', R);
    await expectRedirect(A, '/en?x=1', 301, '/?x=1', R);
    await expectRedirect(A, '/en/', 301, '/', R);
    await expectRedirect(A, '/en/?utm=a&b=2', 301, '/?utm=a&b=2', R);
    await expectRedirect(A, '/en/nope', 301, '/nope', R);
    await expectRedirect(A, '/politica-de-privacidad', 301, '/es/politica-de-privacidad', R);
    await expectRedirect(
      A,
      '/politica-de-privacidad/?x=1',
      301,
      '/es/politica-de-privacidad?x=1',
      R,
    );
    await expectRedirect(A, '/POLITICA-DE-PRIVACIDAD', 301, '/es/politica-de-privacidad', R);
    await expectRedirect(A, '/es', 301, '/es/', R);
    await expectRedirect(A, '/es?x=1', 301, '/es/?x=1', R);

    // ── Ninguna redirección sale del host (bytes crudos) ──────────────────────────────────
    const hostile = [
      '/en//evil.test',
      '/en/\\evil.test',
      '/en/\\\\evil.test',
      '/en/%2F%2Fevil.test',
      '/en/%5Cevil.test',
      '/en/%0d%0aSet-Cookie:x=1',
      '/en/x%0D%0ALocation:%20https://evil.test',
      '/en/.//evil.test',
      '/en/x\\y',
    ];
    for (const path of hostile) {
      const r = await raw(A, path);
      const location = r.headers.location ?? '';
      const target = location ? resolveLocation(location) : null;
      const sameHost = !target || target.host === 'ventea.tech';
      const noInjection =
        !/\r|\n/.test(location) &&
        !r.headers['set-cookie'] &&
        (r.headers.location ?? '').split('\n').length <= 1;
      check(
        `${A}${path} → se queda en ventea.tech`,
        sameHost && noInjection,
        `got ${r.status} ${JSON.stringify(location)} → ${target?.href ?? '-'}`,
      );
    }

    // ── Sin bucles con los 301 que producción (507b9b6) ya publicó sin Cache-Control ──────
    // El navegador tiene en caché estas reglas; se simulan sobre la config nueva.
    const CACHED_OLD = new Map([
      ['/privacy', '/en/privacy'],
      ['/privacy/', '/en/privacy'],
      ['/Privacy', '/en/privacy'],
      ['/en', '/en/'],
    ]);
    for (const start of [...CACHED_OLD.keys(), '/en/', '/en/privacy', '/politica-de-privacidad']) {
      const seen = new Set();
      let path = start;
      let final = null;
      for (let hop = 0; hop < 10; hop += 1) {
        if (seen.has(path)) break;
        seen.add(path);
        if (CACHED_OLD.has(path)) {
          path = CACHED_OLD.get(path);
          continue;
        }
        const r = await raw(A, path);
        if (r.status >= 300 && r.status < 400) {
          const next = resolveLocation(r.headers.location, `https://ventea.tech${path}`);
          path = next.pathname + next.search;
          continue;
        }
        final = r.status;
        break;
      }
      check(
        `sin bucle con caché vieja desde ${start}`,
        final === 200,
        `final=${final} camino=${[...seen].join(' → ')}`,
      );
    }

    // ── Sin regresión: SaaS en el apex, www, app., marca ──────────────────────────────────
    await expectRedirect(A, '/registro?a=1', 301, 'https://app.ventea.tech/registro?a=1');
    await expectRedirect(A, '/terminos', 301, 'https://app.ventea.tech/terminos');
    await expectRedirect(A, '/privacidad', 301, 'https://app.ventea.tech/privacidad');
    await expectRedirect(A, '/precios', 301, 'https://app.ventea.tech/#precios');
    await expectRedirect(A, '/admin', 301, 'https://app.ventea.tech/admin/plataforma');
    await expectRedirect(A, '/plataforma/x', 301, 'https://app.ventea.tech/admin/plataforma');
    await expectRedirect(A, '/api/health', 308, 'https://app.ventea.tech/api/health');
    await expectRedirect('www.ventea.tech', '/es/?q=1', 301, 'https://ventea.tech/es/?q=1');
    await expectPage('app.ventea.tech', '/', 200);
    await expectPage('app.ventea.tech', '/registro', 200);
    await expectPage('carolina.ventea.tech', '/', 200);
    await expectRedirect(
      'carolina.ventea.tech',
      '/admin/plataforma',
      301,
      'https://app.ventea.tech/admin/plataforma',
    );

    // ── Menú público (apps/mobile) en una marca, TASK-018 ────────────────────────────────
    // La app saca la marca del host y llama a /api del mismo origen: la CSP del header
    // (connect-src 'self') y la del <meta> del build tienen que dejarla funcionar.
    {
      const B = 'demo-burgers.ventea.tech';
      const r = await raw(B, '/');
      const header = r.headers['content-security-policy'] ?? '';
      const meta = (
        /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(r.body)?.[1] ?? ''
      ).replaceAll('&#39;', "'");
      check(
        `${B}/ sirve la app (#root)`,
        r.status === 200 && r.body.includes('id="root"'),
        `${r.status}`,
      );
      check(
        `${B}/ CSP header connect-src 'self'`,
        header.includes("connect-src 'self'") && header.includes("script-src 'self'"),
        header,
      );
      check(
        `${B}/ CSP meta del build: scripts propios, sin unsafe-eval`,
        meta.includes("script-src 'self'") && !meta.includes('unsafe-eval'),
        meta,
      );
      check(
        `${B}/ sin <script> inline (CSP script-src 'self')`,
        !/<script(?![^>]*\bsrc=)[^>]*>/i.test(r.body),
      );
      const deep = await raw(B, '/menu');
      check(
        `${B}/menu → index de la SPA`,
        deep.status === 200 && deep.body.includes('id="root"'),
        `${deep.status}`,
      );
      const js = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(r.body)?.[1];
      const bundle = js ? await raw(B, js) : { status: 0, body: '' };
      check(`${B}${js ?? '/assets/*.js'} bundle 200`, bundle.status === 200, `${bundle.status}`);
      const map = js ? await raw(B, `${js}.map`) : { status: 0 };
      check(
        `${B}${js ?? '/assets/*.js'}.map → 404 (sin sourcemaps públicos)`,
        map.status === 404,
        `${map.status}`,
      );
    }

    // ── Headers ────────────────────────────────────────────────────────────────────────────
    for (const path of ['/', '/es/', '/en/', '/nope', '/es/nada', '/en/privacy']) {
      const r = await raw(A, path);
      const h = r.headers;
      const csp = (h['content-security-policy'] ?? '').includes("script-src 'self'");
      check(
        `${A}${path} headers de seguridad`,
        csp &&
          h['x-frame-options'] === 'DENY' &&
          h['x-content-type-options'] === 'nosniff' &&
          Boolean(h['strict-transport-security']),
        `${r.status}`,
      );
      if (r.status === 200 || r.status === 404) {
        check(
          `${A}${path} Cache-Control no-cache`,
          h['cache-control'] === 'no-cache',
          JSON.stringify(h['cache-control']),
        );
      }
    }
  } finally {
    if (!KEEP) {
      try {
        docker('rm', '-f', NAME);
      } catch {
        // ya no existe
      }
      if (BUILD) {
        try {
          docker('rmi', IMAGE);
        } catch {
          // la imagen está en uso o ya no existe
        }
      }
    }
  }

  console.log(results.join('\n'));
  console.log(`\n${results.length - failed}/${results.length} casos OK`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  try {
    docker('rm', '-f', NAME);
  } catch {
    // nada
  }
  console.error(error);
  process.exit(1);
});
