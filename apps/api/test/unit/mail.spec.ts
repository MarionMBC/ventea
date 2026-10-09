import { redactSensitive } from '@/common/logging/redact';
import {
  headerText,
  parseMailFrom,
  parseRecipient,
  parseRecipientList,
} from '@/modules/mail/mail-address';
import { escapeHtml, isSafeLink, renderEmail } from '@/modules/mail/mail-templates';
import { createMailTransport, NoopMailTransport } from '@/modules/mail/mail-transport';
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

describe('plantillas', () => {
  it('escapa los datos de la marca en el HTML y no deja etiquetas crudas', () => {
    const mail = renderEmail('welcome', 'es', welcome(HOSTILE, HOSTILE));
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Pollos&quot; &#39;Ñandú&#39;',
    );
    // El texto plano lleva el nombre tal cual (no es HTML).
    expect(mail.text).toContain(HOSTILE);
  });

  it('el nombre con saltos de línea no llega al asunto', () => {
    const mail = renderEmail('welcome', 'es', welcome('Pollos\r\nBcc: x@evil.com'));
    expect(mail.subject).toBe('Bienvenido a Ventea, Pollos Bcc: x@evil.com');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('idioma de la marca: ES y EN, con pie que explica por qué llega', () => {
    const es = renderEmail('welcome', 'es', welcome());
    const en = renderEmail('welcome', 'en', welcome());
    expect(es.subject).toBe('Bienvenido a Ventea, Pollos Ana');
    expect(es.html).toContain('<html lang="es">');
    expect(es.text).toContain('Recibes este correo porque creaste la cuenta de Pollos Ana');
    expect(es.text).toContain('no publicidad');
    expect(en.subject).toBe('Welcome to Ventea, Pollos Ana');
    expect(en.html).toContain('<html lang="en">');
    expect(en.text).toContain('You are receiving this email because');
    // Fecha en la zona de la marca y el idioma.
    expect(es.text).toContain('23 de octubre de 2026');
    expect(en.text).toContain('October 23, 2026');
  });

  it('la solicitud de app va siempre en español (aviso interno)', () => {
    const mail = renderEmail('app_request', 'en', {
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
    const grace = renderEmail('past_due', 'es', { ...base, graceEndsAt: at(7).toISOString() });
    expect(grace.text).toContain('siguen funcionando hasta el 16 de octubre de 2026');
    expect(grace.text).toContain('no se cobra solo');
    const trial = renderEmail('past_due', 'es', { ...base, graceEndsAt: null });
    expect(trial.subject).toBe('Tu prueba de Ventea terminó · Pollos Ana');
    expect(trial.text).toContain('dejó de recibir pedidos');
  });

  it('datos inválidos o tipo desconocido tiran (error permanente)', () => {
    expect(() => renderEmail('nope', 'es', {})).toThrow('desconocido');
    expect(() =>
      renderEmail('welcome', 'es', { ...welcome(), panelUrl: 'javascript:alert(1)' }),
    ).toThrow('Datos inválidos');
    expect(() =>
      renderEmail('welcome', 'es', { ...welcome(), menuUrl: 'http://evil.com' }),
    ).toThrow();
  });

  it('links seguros: https, o http solo a localhost', () => {
    expect(isSafeLink('https://pollos.ventea.tech/admin')).toBe(true);
    expect(isSafeLink('http://localhost:5173/admin')).toBe(true);
    expect(isSafeLink('http://pollos.ventea.tech')).toBe(false);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('https://u:p@pollos.ventea.tech')).toBe(false);
  });

  it('escapeHtml cubre los 5 caracteres', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
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

  it('el log nunca muestra la clave de SMTP_URL', () => {
    const line = redactSensitive(
      'SMTP_URL=smtps://avisos%40ventea.tech:S3cr3t-Pass@smtp.zoho.com:465',
    );
    expect(line).not.toContain('S3cr3t-Pass');
    const err = redactSensitive('connect fail smtps://avisos:S3cr3t@smtp.zoho.com:465 timeout');
    expect(err).toBe('connect fail smtps://avisos:[REDACTED]@smtp.zoho.com:465 timeout');
    expect(redactSensitive(JSON.stringify({ smtpUrl: 'smtp://x:y@h' }))).not.toContain('x:y');
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
    expect(lifecycleEmailDue(trial(2), NOW)).toMatchObject({ kind: 'trial_ending', daysLeft: 3 });
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
