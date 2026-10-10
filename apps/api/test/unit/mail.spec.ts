import {
  hasUnambiguousLink,
  LINK_CHECK_MAX,
  neutralizeLinks,
  signupSchema,
  TERMS_VERSION,
} from '@ventea/shared';

import { redactSensitive } from '@/common/logging/redact';
import {
  headerText,
  parseMailFrom,
  parseRecipient,
  parseRecipientList,
} from '@/modules/mail/mail-address';
import { escapeHtml, isSafeLink, renderEmail } from '@/modules/mail/mail-templates';
import { createMailTransport, NoopMailTransport } from '@/modules/mail/mail-transport';
import { maskEmails } from '@/modules/mail/mail.service';
import { lifecycleEmailDue } from '@/modules/notifications/lifecycle-rules';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-09T12:00:00.000Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

const HOSTILE = '<script>alert(1)</script> & "Pollos" \'Ñandú\'';

const welcome = (tenantName = 'Pollos Ana', ownerName = 'Ana') => ({
  tenantName,
  ownerName,
  panelUrl: 'https://pollos.ventea.tech/admin',
  menuUrl: 'https://pollos.ventea.tech',
  trialEndsAt: '2026-10-23T12:00:00.000Z',
  timeZone: 'America/Tegucigalpa',
  supportEmail: 'hola@ventea.tech',
});

describe('direcciones y headers del correo', () => {
  it('acepta una sola dirección válida y la normaliza', () => {
    expect(parseRecipient('  Ana@Example.COM ')).toBe('ana@example.com');
  });

  it('rechaza CR/LF, listas y direcciones inválidas (header injection)', () => {
    expect(parseRecipient('ana@example.com\r\nBcc: x@evil.com')).toBeNull();
    expect(parseRecipient('ana@example.com\nBcc:x@evil.com')).toBeNull();
    expect(parseRecipient('ana@example.com, otro@example.com')).toBeNull();
    expect(parseRecipient('Ana <ana@example.com>')).toBeNull();
    expect(parseRecipient('no-es-correo')).toBeNull();
    expect(parseRecipient(`ana@example.com${String.fromCharCode(0x2028)}`)).toBeNull();
  });

  it('PLATFORM_ALERT_EMAILS: lista separada por comas, sin duplicados; una inválida tira', () => {
    expect(parseRecipientList(' a@x.com, B@x.com;a@x.com  c@x.com ', 'K')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ]);
    expect(parseRecipientList('', 'K')).toEqual([]);
    expect(parseRecipientList(undefined, 'K')).toEqual([]);
    expect(() => parseRecipientList('a@x.com, roto', 'K')).toThrow('K');
  });

  it('MAIL_FROM: default, «Nombre <dir>» o dir sola; mal formada o con CR/LF tira', () => {
    expect(parseMailFrom(undefined)).toEqual({ name: 'Ventea', address: 'hola@ventea.tech' });
    expect(parseMailFrom('Equipo Ventea <avisos@ventea.tech>')).toEqual({
      name: 'Equipo Ventea',
      address: 'avisos@ventea.tech',
    });
    expect(parseMailFrom('avisos@ventea.tech')).toEqual({
      name: null,
      address: 'avisos@ventea.tech',
    });
    expect(() => parseMailFrom('Ventea <avisos@ventea.tech>\r\nBcc: x@evil.com')).toThrow();
    expect(() => parseMailFrom('Ventea')).toThrow('MAIL_FROM');
  });

  it('asunto: sin caracteres de control y recortado', () => {
    expect(headerText('Hola\r\nBcc: x@evil.com')).toBe('Hola Bcc: x@evil.com');
    expect(headerText('a'.repeat(300))).toHaveLength(150);
  });
});

/** Dominios a los que pueden apuntar los links de un correo (TENANT_BASE_DOMAIN en tests). */
const LINKS = { hosts: ['ventea.tech'] };
const render = (kind: string, lang: 'es' | 'en', payload: unknown) =>
  renderEmail(kind, lang, payload, LINKS);

describe('plantillas', () => {
  it('escapa los datos de la marca en el HTML y no deja etiquetas crudas', () => {
    const mail = render('welcome', 'es', welcome(HOSTILE, HOSTILE));
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Pollos&quot; &#39;Ñandú&#39;',
    );
    // El texto plano lleva el nombre tal cual (no es HTML).
    expect(mail.text).toContain(HOSTILE);
  });

  it('bienvenida (anti-phishing): asunto genérico, sin el nombre de la marca ni del dueño', () => {
    const es = render('welcome', 'es', welcome('Cuenta suspendida, entra a evil.com', 'Soporte'));
    const en = render('welcome', 'en', welcome('Pollos Ana', 'Ana'));
    expect(es.subject).toBe('Tu cuenta de Ventea está lista');
    expect(en.subject).toBe('Your Ventea account is ready');
    expect(es.subject).not.toMatch(/evil|Soporte/);
  });

  it('nombres en el cuerpo: sin URLs ni dominios que un cliente de correo convierta en link', () => {
    const mail = render(
      'welcome',
      'es',
      welcome(
        'Cuenta suspendida https://evil.example/login www.evil.com evil.com.hn',
        'Entra a soporte-ventea.co',
      ),
    );
    for (const body of [mail.text, mail.html]) {
      expect(body).not.toMatch(/https?:\/\/evil|www\.evil|evil\.com|evil\.example|ventea\.co\b/);
    }
    // Los links del correo son solo los de Ventea (un único <a>: el botón).
    expect(mail.html.match(/<a /g)).toHaveLength(1);
    // Lo legítimo sigue intacto.
    expect(mail.text).toContain('https://pollos.ventea.tech/admin');
  });

  it('nombres truncados a 60 caracteres en el cuerpo', () => {
    const long = `Pollos ${'a'.repeat(100)}`;
    const mail = render('welcome', 'es', welcome(long, 'Ana'));
    expect(mail.text).not.toContain(long.slice(0, 61));
    expect(mail.text).toContain(`${long.slice(0, 59)}…`);
  });

  it('el nombre con saltos de línea no llega al asunto ni arma párrafos', () => {
    const mail = render('trial_ending', 'es', {
      tenantName: 'Pollos\r\nBcc: x@evil.com',
      daysLeft: 3,
      trialEndsAt: NOW.toISOString(),
      billingUrl: 'https://pollos.ventea.tech/admin/facturacion',
      supportEmail: 'hola@ventea.tech',
    });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toContain('Pollos Bcc:');
  });

  it('idioma de la marca: ES y EN, con pie que explica por qué llega', () => {
    const es = render('welcome', 'es', welcome());
    const en = render('welcome', 'en', welcome());
    expect(es.html).toContain('<html lang="es">');
    expect(es.text).toContain('Recibes este correo porque creaste la cuenta de Pollos Ana');
    expect(es.text).toContain('no publicidad');
    expect(en.html).toContain('<html lang="en">');
    expect(en.text).toContain('You are receiving this email because');
    // Fecha en la zona de la marca y el idioma.
    expect(es.text).toContain('23 de octubre de 2026');
    expect(en.text).toContain('October 23, 2026');
  });

  it('prueba por vencer: el asunto dice los días reales', () => {
    const data = (daysLeft: number) => ({
      tenantName: 'Pollos Ana',
      daysLeft,
      trialEndsAt: NOW.toISOString(),
      billingUrl: 'https://pollos.ventea.tech/admin/facturacion',
      supportEmail: 'hola@ventea.tech',
    });
    expect(render('trial_ending', 'es', data(2)).subject).toBe(
      'Tu prueba de Ventea termina en 2 días · Pollos Ana',
    );
    expect(render('trial_ending', 'en', data(2)).subject).toBe(
      'Your Ventea trial ends in 2 days · Pollos Ana',
    );
    expect(render('trial_ending', 'es', data(1)).subject).toContain('termina mañana');
    expect(render('trial_ending', 'es', data(3)).subject).toContain('termina en 3 días');
  });

  it('la solicitud de app va siempre en español (aviso interno)', () => {
    const mail = render('app_request', 'en', {
      tenantName: 'Pollos Ana',
      slug: 'pollos',
      planName: 'Pro',
      requestedAt: NOW.toISOString(),
      queueUrl: 'https://app.ventea.tech/admin/plataforma/apps',
      appUrl: 'https://app.ventea.tech/admin/plataforma/marcas/pollos/app',
      supportEmail: 'hola@ventea.tech',
    });
    expect(mail.subject).toBe('Solicitud de app: Pollos Ana (pollos)');
    expect(mail.text).toContain('plan Pro');
    expect(mail.html).toContain('href="https://app.ventea.tech/admin/plataforma/apps"');
  });

  it('pago pendiente: con gracia dice hasta cuándo atiende; sin gracia, que la prueba terminó', () => {
    const base = {
      tenantName: 'Pollos Ana',
      periodEnd: NOW.toISOString(),
      billingUrl: 'https://pollos.ventea.tech/admin/facturacion',
      supportEmail: 'hola@ventea.tech',
    };
    const grace = render('past_due', 'es', { ...base, graceEndsAt: at(7).toISOString() });
    expect(grace.text).toContain('siguen funcionando hasta el 16 de octubre de 2026');
    expect(grace.text).toContain('no se cobra solo');
    const trial = render('past_due', 'es', { ...base, graceEndsAt: null });
    expect(trial.subject).toBe('Tu prueba de Ventea terminó · Pollos Ana');
    expect(trial.text).toContain('dejó de recibir pedidos');
  });

  it('datos inválidos o tipo desconocido tiran (error permanente)', () => {
    expect(() => render('nope', 'es', {})).toThrow('desconocido');
    expect(() =>
      render('welcome', 'es', { ...welcome(), panelUrl: 'javascript:alert(1)' }),
    ).toThrow('Datos inválidos');
    expect(() => render('welcome', 'es', { ...welcome(), menuUrl: 'http://evil.com' })).toThrow();
  });

  it('links solo al dominio de la plataforma', () => {
    expect(() =>
      render('welcome', 'es', { ...welcome(), panelUrl: 'https://evil.com/admin' }),
    ).toThrow('link no permitido');
    expect(() =>
      render('welcome', 'es', { ...welcome(), panelUrl: 'https://ventea.tech.evil.com/admin' }),
    ).toThrow('link no permitido');
    expect(() =>
      render('welcome', 'es', { ...welcome(), panelUrl: 'https://evilventea.tech/admin' }),
    ).toThrow('link no permitido');
    expect(() =>
      renderEmail('welcome', 'es', welcome(), { hosts: ['ventea.tech', 'panel.example.com'] }),
    ).not.toThrow();
    expect(() =>
      renderEmail(
        'welcome',
        'es',
        { ...welcome(), panelUrl: 'https://panel.example.com/admin' },
        { hosts: ['ventea.tech', 'panel.example.com'] },
      ),
    ).not.toThrow();
  });

  it('links seguros: https, o http solo a localhost; host dentro del dominio base', () => {
    const hosts = ['ventea.tech'];
    expect(isSafeLink('https://pollos.ventea.tech/admin', hosts)).toBe(true);
    expect(isSafeLink('https://ventea.tech/', hosts)).toBe(true);
    expect(isSafeLink('http://localhost:5173/admin', ['localhost'])).toBe(true);
    expect(isSafeLink('http://localhost:5173/admin', hosts)).toBe(false);
    expect(isSafeLink('http://pollos.ventea.tech', hosts)).toBe(false);
    expect(isSafeLink('https://evil.com', hosts)).toBe(false);
    expect(isSafeLink('javascript:alert(1)', hosts)).toBe(false);
    expect(isSafeLink('https://u:p@pollos.ventea.tech', hosts)).toBe(false);
  });

  it('escapeHtml cubre los 5 caracteres', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('nombres con links (anti-phishing)', () => {
  const signupBody = (names: { restaurantName?: string; ownerName?: string } = {}) => ({
    restaurantName: 'Pollos Juan',
    slug: 'pollos-juan',
    ownerName: 'Juan Pérez',
    ownerEmail: 'juan@example.com',
    ownerPassword: 'una-clave-larga-123',
    planCode: 'pro',
    interval: 'month',
    acceptedTermsVersion: TERMS_VERSION,
    ...names,
  });

  /** Nombres reales con punto pegado (títulos, marcas): el registro los acepta. */
  const REAL_NAMES = [
    'Pollo.Express',
    'Burger.co',
    'Sushi.Bar',
    'Mr.Pollo',
    'Tacos.mx',
    'Hnos.García',
    'Lic.María López',
    'Ing.Carlos Pérez',
    'Ma.José',
  ];

  it('el signup rechaza solo lo inequívoco: ://, www., @ y /', () => {
    for (const bad of [
      'https://evil.com',
      've a http://x',
      'www.evil',
      'WWW.Evil.com',
      'soporte@evil',
      'evil/login',
      'ftp://x',
    ]) {
      expect(hasUnambiguousLink(bad)).toBe(true);
      expect(signupSchema.safeParse(signupBody({ restaurantName: bad })).success).toBe(false);
      expect(signupSchema.safeParse(signupBody({ ownerName: bad })).success).toBe(false);
    }
  });

  it('el signup acepta nombres reales con punto pegado (sin falsos positivos)', () => {
    for (const name of [...REAL_NAMES, 'S.A. de C.V.', 'Café 1.5', 'www Tacos', "D'Angelo's"]) {
      expect(hasUnambiguousLink(name)).toBe(false);
      expect(
        signupSchema.safeParse(signupBody({ restaurantName: name, ownerName: name })).success,
      ).toBe(true);
    }
  });

  it('en el correo esos nombres salen neutralizados («Pollo Express»)', () => {
    expect(neutralizeLinks('Pollo.Express')).toBe('Pollo Express');
    expect(neutralizeLinks('Lic.María López')).toBe('Lic María López');
    expect(neutralizeLinks('Tacos.mx')).toBe('Tacos mx');
    for (const name of REAL_NAMES) expect(neutralizeLinks(name)).not.toMatch(/\p{L}\.\p{L}{2}/u);
    const mail = render('welcome', 'es', welcome('Pollo.Express', 'Lic.María López'));
    expect(mail.text).toContain('Creamos Pollo Express.');
    expect(mail.text).toContain('Lic María López');
  });

  it('neutralizeLinks cubre acentos, IDN, puntos anchos y esquemas', () => {
    expect(neutralizeLinks('entra a café.com')).toBe('entra a café com');
    expect(neutralizeLinks('evil.рф')).toBe('evil рф');
    expect(neutralizeLinks('evil。com')).toBe('evil com');
    expect(neutralizeLinks('evil．com')).toBe('evil com');
    expect(neutralizeLinks('evil｡com')).toBe('evil com');
    expect(neutralizeLinks('https://evil.example/login')).toBe('evil example/login');
    expect(neutralizeLinks('www.evil.com.hn')).toBe('www evil com hn');
    // Lo que no parece dominio queda igual.
    expect(neutralizeLinks('S.A. de C.V. · Café 1.5 · J.P. Grill')).toBe(
      'S.A. de C.V. · Café 1.5 · J.P. Grill',
    );
  });

  it('el signup acepta «/» entre dígitos y «www.» que no empieza palabra (TASK-025)', () => {
    for (const name of ['Comida 24/7', 'Pizza 1/2', 'Awww.Pizza', 'Grill 3/4 y 1/2']) {
      expect(hasUnambiguousLink(name)).toBe(false);
      expect(
        signupSchema.safeParse(signupBody({ restaurantName: name, ownerName: name })).success,
      ).toBe(true);
    }
    // Sigue rechazando la barra fuera de dígitos y «www.» al inicio de palabra.
    for (const bad of [
      '24/evil',
      'evil/7',
      'a /b',
      '24/ 7',
      've a www.evil',
      '(www.evil)',
      '24/7/login',
    ]) {
      expect(hasUnambiguousLink(bad)).toBe(true);
    }
  });

  it('neutralizeLinks: invisibles, marcas combinantes e IPv4 sin esquema (TASK-025)', () => {
    // Invisibles (\p{Cf} / Default_Ignorable) no esconden el dominio.
    expect(neutralizeLinks('evil.c\u200Bom')).toBe('evil com');
    expect(neutralizeLinks('evil.c\u00ADom')).toBe('evil com');
    expect(neutralizeLinks('evil\u2060.com')).toBe('evil com');
    expect(neutralizeLinks('evil.\uFE0Fcom')).toBe('evil com');
    // Una marca combinante (sin forma compuesta en NFKC) cuenta como letra.
    expect(neutralizeLinks('evil.c\u0332om')).not.toMatch(/\./);
    expect(neutralizeLinks('evil\u0332.com')).not.toMatch(/\./);
    // IPv4 sin esquema.
    expect(neutralizeLinks('entra a 192.168.0.1')).toBe('entra a 192 168 0 1');
    expect(neutralizeLinks('10.0.0.1:8080/login')).not.toMatch(/\d\.\d/);
    // Lo que no es IP queda.
    expect(neutralizeLinks('Café 1.5 · v2.0.1')).toBe('Café 1.5 · v2.0.1');
  });

  it('neutralizeLinks: IPv4 dentro de tramos con grupos inválidos y esquemas repetidos (review TASK-025)', () => {
    expect(neutralizeLinks('1..8.8.8.8')).not.toMatch(/8\.8/);
    expect(neutralizeLinks('1234.8.8.8.8')).not.toMatch(/8\.8/);
    expect(neutralizeLinks('ip 9.9.9.9..1.5')).toBe('ip 9 9 9 9..1.5');
    expect(neutralizeLinks('https://https://evil.com')).toBe('evil com');
    expect(neutralizeLinks('hxxp://ftp://www.evil.com/x')).toBe('www evil com/x');
  });

  it('neutralizeLinks conserva ZWNJ/ZWJ dentro de palabras y emoji, y no lo dejan pasar un dominio', () => {
    const persian = 'می' + '\u200C' + 'خواهم';
    expect(neutralizeLinks(persian)).toBe(persian);
    const family = '👨' + '\u200D' + '👩' + '\u200D' + '👧 Tacos';
    expect(neutralizeLinks(family)).toBe(family);
    // Un ZWJ/ZWNJ entre letras no esconde el dominio; junto al punto se quita.
    expect(neutralizeLinks('evil.c' + '\u200D' + 'om')).not.toMatch(/\./);
    expect(neutralizeLinks('evil.c' + '\u200C' + 'om')).not.toMatch(/\./);
    expect(neutralizeLinks('evil' + '\u200D' + '.com')).toBe('evil com');
    // El signup mira sin ningún invisible.
    expect(hasUnambiguousLink('w' + '\u200D' + 'ww.evil')).toBe(true);
  });

  it('DoS: fuzz de 200 KB en neutralizeLinks y hasUnambiguousLink en menos de 50 ms', () => {
    const pieces = ['.', '/', '\u200B', '\u0332', 'a', '1', 'www.', '://', '@', ' ', 'é', '。'];
    let seed = 7;
    let fuzz = '';
    while (fuzz.length < 200_000) {
      seed = (seed * 48271) % 2147483647;
      fuzz += pieces[seed % pieces.length];
    }
    const start = performance.now();
    neutralizeLinks(fuzz);
    hasUnambiguousLink(fuzz);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('DoS: 100 KB en el nombre se rechaza en menos de 50 ms', () => {
    const huge = `${'a.'.repeat(50_000)}1`;
    let start = performance.now();
    const result = signupSchema.safeParse(signupBody({ restaurantName: huge, ownerName: huge }));
    expect(performance.now() - start).toBeLessThan(50);
    expect(result.success).toBe(false);
    start = performance.now();
    hasUnambiguousLink(huge);
    neutralizeLinks(huge);
    expect(performance.now() - start).toBeLessThan(50);
    // El tope de entrada corta antes de procesar.
    expect(neutralizeLinks(huge).length).toBeLessThanOrEqual(LINK_CHECK_MAX);
  });
});

describe('transporte', () => {
  it('sin SMTP_URL es no-op; mal formada tira', () => {
    expect(createMailTransport(undefined)).toBeInstanceOf(NoopMailTransport);
    expect(createMailTransport('  ').configured).toBe(false);
    expect(() => createMailTransport('http://smtp.example.com')).toThrow('SMTP_URL');
    expect(() => createMailTransport('no es url')).toThrow('SMTP_URL');
    expect(createMailTransport('smtps://u:p@smtp.example.com:465').configured).toBe(true);
  });

  it('SMTP_URL con parámetros (requireTLS, ignoreTLS, debug…) se rechaza: no pisan TLS ni el log', () => {
    for (const query of [
      '?requireTLS=false',
      '?ignoreTLS=true',
      '?debug=true&logger=true',
      '?x=1',
    ]) {
      expect(() => createMailTransport(`smtp://u:p@smtp.example.com:587${query}`)).toThrow(
        'SMTP_URL',
      );
    }
    expect(() => createMailTransport('smtps://u:p@smtp.example.com:465#frag')).toThrow('SMTP_URL');
  });

  it('el log nunca muestra la clave de SMTP_URL', () => {
    const line = redactSensitive(
      'SMTP_URL=smtps://avisos%40ventea.tech:S3cr3t-Pass@smtp.zoho.com:465',
    );
    expect(line).not.toContain('S3cr3t-Pass');
    const err = redactSensitive('connect fail smtps://avisos:S3cr3t@smtp.zoho.com:465 timeout');
    expect(err).toBe('connect fail smtps://avisos:[REDACTED]@smtp.zoho.com:465 timeout');
    expect(redactSensitive(JSON.stringify({ smtpUrl: 'smtp://x:y@h' }))).not.toContain('x:y');
  });

  it('enmascara direcciones en los logs', () => {
    expect(maskEmails('550 <ana@example.com>: no existe; copia a b.c@x.org')).toBe(
      '550 <[email]>: no existe; copia a [email]',
    );
  });
});

describe('correos de ciclo de vida (reglas)', () => {
  const trial = (endsInDays: number) => ({
    status: 'trialing' as const,
    trialEndsAt: at(endsInDays),
    currentPeriodEnd: at(endsInDays),
  });

  it('prueba por vencer: 3 días, 1 día y nada fuera de esas ventanas', () => {
    expect(lifecycleEmailDue(trial(5), NOW)).toBeNull();
    expect(lifecycleEmailDue(trial(3), NOW)).toMatchObject({ kind: 'trial_ending', daysLeft: 3 });
    // Días reales en el asunto; la ventana (aviso de 3 o de 1) sigue siendo una sola.
    expect(lifecycleEmailDue(trial(2), NOW)).toMatchObject({ kind: 'trial_ending', daysLeft: 2 });
    expect(lifecycleEmailDue(trial(2.5), NOW)).toMatchObject({ daysLeft: 3 });
    const sameTrial = trial(3);
    expect(lifecycleEmailDue(sameTrial, NOW)?.occurrence).toBe(
      lifecycleEmailDue(sameTrial, at(1))?.occurrence,
    );
    expect(lifecycleEmailDue(trial(1), NOW)).toMatchObject({ kind: 'trial_ending', daysLeft: 1 });
    expect(lifecycleEmailDue(trial(0.2), NOW)).toMatchObject({ daysLeft: 1 });
    expect(lifecycleEmailDue(trial(-0.1), NOW)).toBeNull();
    // La ocurrencia distingue el aviso de 3 del de 1 y una prueba extendida.
    expect(lifecycleEmailDue(trial(3), NOW)?.occurrence).not.toBe(
      lifecycleEmailDue(trial(1), NOW)?.occurrence,
    );
  });

  it('past_due con gracia: aviso en la primera mitad, recordatorio en la segunda, nada al final', () => {
    // Período pagado (prueba terminó antes) que venció hace `ago` días.
    const pastDue = (ago: number) => ({
      status: 'past_due' as const,
      trialEndsAt: at(-60),
      currentPeriodEnd: at(-ago),
    });
    expect(lifecycleEmailDue(pastDue(0.01), NOW)).toMatchObject({ kind: 'past_due' });
    expect(lifecycleEmailDue(pastDue(3), NOW)).toMatchObject({ kind: 'past_due' });
    expect(lifecycleEmailDue(pastDue(3.5), NOW)).toMatchObject({
      kind: 'past_due_reminder',
      daysLeft: 4,
    });
    expect(lifecycleEmailDue(pastDue(6.5), NOW)).toMatchObject({ daysLeft: 1 });
    expect(lifecycleEmailDue(pastDue(7), NOW)).toBeNull();
    // Mismo período → misma ocurrencia en los dos tipos (la dedupeKey lleva el tipo).
    const sub = pastDue(1);
    expect(lifecycleEmailDue(sub, NOW)?.occurrence).toBe(lifecycleEmailDue(sub, at(4))?.occurrence);
  });

  it('past_due sin gracia (prueba vencida): un aviso si es reciente, nada si es viejo', () => {
    const expired = (ago: number) => ({
      status: 'past_due' as const,
      trialEndsAt: at(-ago),
      currentPeriodEnd: at(-ago),
    });
    expect(lifecycleEmailDue(expired(1), NOW)).toMatchObject({
      kind: 'past_due',
      graceEndsAt: null,
    });
    expect(lifecycleEmailDue(expired(20), NOW)).toBeNull();
  });

  it('otros estados y past_due anómalo (período vigente) no generan correo', () => {
    for (const status of ['active', 'suspended', 'canceled'] as const) {
      expect(
        lifecycleEmailDue({ status, trialEndsAt: null, currentPeriodEnd: at(-1) }, NOW),
      ).toBeNull();
    }
    expect(
      lifecycleEmailDue({ status: 'past_due', trialEndsAt: null, currentPeriodEnd: at(2) }, NOW),
    ).toBeNull();
  });
});
