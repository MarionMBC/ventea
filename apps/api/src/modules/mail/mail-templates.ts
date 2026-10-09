import type { BrandLanguage, EmailKind } from '@ventea/shared';
import { z } from 'zod';

import { headerText, inlineText } from './mail-address';

/**
 * Plantillas de los correos transaccionales (TASK-021). Lógica pura: datos → asunto, texto
 * plano y HTML simple con la marca Ventea.
 *
 * Seguridad: todo dato que viene de una marca (nombre, dueño…) entra como TEXTO a los bloques
 * y se escapa UNA vez, al armar el HTML (`escapeHtml`). Ninguna plantilla concatena HTML con
 * datos. Los links solo se aceptan `https:` (o `http:` a localhost en desarrollo).
 *
 * Para agregar un tipo de correo: sumarlo a `EMAIL_KIND` (@ventea/shared) y una entrada en
 * `TEMPLATES` con el schema de sus datos y sus textos ES/EN.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Contenido de un correo, en texto plano. El layout lo arma `layout`. */
interface EmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  steps?: string[];
  cta?: { label: string; url: string };
  /** Por qué le llega este correo (pie obligatorio). */
  footer: string;
}

/** Datos comunes: zona horaria para las fechas y el contacto de soporte. */
const baseSchema = z.object({
  timeZone: z.string().max(64).default('UTC'),
  supportEmail: z.string().max(254),
});

const urlSchema = z.string().max(500).refine(isSafeLink, 'link no permitido');

const nameSchema = z.string().min(1).max(200);

const TEMPLATE_DATA = {
  app_request: baseSchema.extend({
    tenantName: nameSchema,
    slug: z.string().max(63),
    planName: z.string().max(80).nullable(),
    requestedAt: z.iso.datetime(),
    queueUrl: urlSchema,
    appUrl: urlSchema,
  }),
  welcome: baseSchema.extend({
    tenantName: nameSchema,
    ownerName: nameSchema,
    panelUrl: urlSchema,
    menuUrl: urlSchema,
    trialEndsAt: z.iso.datetime().nullable(),
  }),
  trial_ending: baseSchema.extend({
    tenantName: nameSchema,
    daysLeft: z.union([z.literal(1), z.literal(3)]),
    trialEndsAt: z.iso.datetime(),
    billingUrl: urlSchema,
  }),
  past_due: baseSchema.extend({
    tenantName: nameSchema,
    /** Null: la prueba venció sin pago (no hay gracia, ya no recibe pedidos). */
    graceEndsAt: z.iso.datetime().nullable(),
    periodEnd: z.iso.datetime(),
    billingUrl: urlSchema,
  }),
  past_due_reminder: baseSchema.extend({
    tenantName: nameSchema,
    graceEndsAt: z.iso.datetime(),
    daysLeft: z.number().int().min(0).max(30),
    billingUrl: urlSchema,
  }),
} satisfies Record<EmailKind, z.ZodType>;

export type EmailTemplateData = { [K in EmailKind]: z.input<(typeof TEMPLATE_DATA)[K]> };

type Data<K extends EmailKind> = z.output<(typeof TEMPLATE_DATA)[K]>;

const TEMPLATES: {
  [K in EmailKind]: (
    data: Data<K>,
    lang: BrandLanguage,
    fmt: (iso: string) => string,
  ) => EmailContent;
} = {
  // Aviso interno a la plataforma: siempre en español.
  app_request: (d, _lang, fmt) => ({
    subject: `Solicitud de app: ${d.tenantName} (${d.slug})`,
    heading: 'Una marca pidió su app propia',
    paragraphs: [
      `${d.tenantName} (${d.slug}${d.planName ? `, plan ${d.planName}` : ''}) pidió su app nativa el ${fmt(d.requestedAt)}.`,
      `Ficha de la app de la marca: ${d.appUrl}`,
    ],
    cta: { label: 'Ver la cola de apps', url: d.queueUrl },
    footer:
      'Recibes este correo porque estás en la lista de avisos de la plataforma Ventea (PLATFORM_ALERT_EMAILS) o eres administrador de la plataforma.',
  }),

  welcome: (d, lang, fmt) =>
    lang === 'en'
      ? {
          subject: `Welcome to Ventea, ${d.tenantName}`,
          heading: `${d.ownerName}, your brand is live on Ventea`,
          paragraphs: [
            d.trialEndsAt
              ? `We created ${d.tenantName}. Your free trial runs until ${fmt(d.trialEndsAt)}.`
              : `We created ${d.tenantName}.`,
            'Next steps:',
          ],
          steps: [
            'Sign in to your dashboard and load your menu: categories, products and photos.',
            'Set up your brand in "My brand": logo, colors and contact details.',
            `Share your menu link with your customers: ${d.menuUrl}`,
          ],
          cta: { label: 'Go to my dashboard', url: d.panelUrl },
          footer: `You are receiving this email because you created the ${d.tenantName} account on Ventea. It is a service notice, not marketing. Questions: ${d.supportEmail}`,
        }
      : {
          subject: `Bienvenido a Ventea, ${d.tenantName}`,
          heading: `${d.ownerName}, tu marca ya está en Ventea`,
          paragraphs: [
            d.trialEndsAt
              ? `Creamos ${d.tenantName}. Tu prueba gratis dura hasta el ${fmt(d.trialEndsAt)}.`
              : `Creamos ${d.tenantName}.`,
            'Próximos pasos:',
          ],
          steps: [
            'Entra a tu panel y carga tu menú: categorías, productos y fotos.',
            'Ajusta tu marca en «Mi marca»: logo, colores y datos de contacto.',
            `Comparte el link de tu menú con tus clientes: ${d.menuUrl}`,
          ],
          cta: { label: 'Entrar a mi panel', url: d.panelUrl },
          footer: `Recibes este correo porque creaste la cuenta de ${d.tenantName} en Ventea. Es un aviso del servicio, no publicidad. Dudas: ${d.supportEmail}`,
        },

  trial_ending: (d, lang, fmt) =>
    lang === 'en'
      ? {
          subject:
            d.daysLeft === 1
              ? `Your Ventea trial ends tomorrow · ${d.tenantName}`
              : `Your Ventea trial ends in 3 days · ${d.tenantName}`,
          heading: d.daysLeft === 1 ? 'Your trial ends tomorrow' : 'Your trial ends in 3 days',
          paragraphs: [
            `The free trial of ${d.tenantName} ends on ${fmt(d.trialEndsAt)}. After that, your menu stops taking orders until the plan is paid.`,
            `Payment is arranged with the Ventea team: check your plan in Billing and write to us at ${d.supportEmail}. If you already arranged it, you can ignore this notice.`,
          ],
          cta: { label: 'Go to Billing', url: d.billingUrl },
          footer: `You are receiving this email because you own the ${d.tenantName} account on Ventea. It is a service notice about your subscription, not marketing.`,
        }
      : {
          subject:
            d.daysLeft === 1
              ? `Tu prueba de Ventea termina mañana · ${d.tenantName}`
              : `Tu prueba de Ventea termina en 3 días · ${d.tenantName}`,
          heading: d.daysLeft === 1 ? 'Tu prueba termina mañana' : 'Tu prueba termina en 3 días',
          paragraphs: [
            `La prueba gratis de ${d.tenantName} termina el ${fmt(d.trialEndsAt)}. Después, tu menú deja de recibir pedidos hasta que se pague el plan.`,
            `El pago se coordina con el equipo de Ventea: revisa tu plan en Facturación y escríbenos a ${d.supportEmail}. Si ya lo coordinaste, ignora este aviso.`,
          ],
          cta: { label: 'Ir a Facturación', url: d.billingUrl },
          footer: `Recibes este correo porque eres dueño de la cuenta de ${d.tenantName} en Ventea. Es un aviso del servicio sobre tu suscripción, no publicidad.`,
        },

  past_due: (d, lang, fmt) => {
    if (lang === 'en') {
      return d.graceEndsAt
        ? {
            subject: `Payment pending for your Ventea plan · ${d.tenantName}`,
            heading: 'Your payment is pending',
            paragraphs: [
              `The paid period of ${d.tenantName} ended on ${fmt(d.periodEnd)} and we have not recorded the payment yet. Your menu and orders keep working until ${fmt(d.graceEndsAt)}; after that, the brand stops taking orders until the payment is settled.`,
              `Payment is arranged with the Ventea team (it is not charged automatically): write to us at ${d.supportEmail} or check your plan in Billing.`,
            ],
            cta: { label: 'Go to Billing', url: d.billingUrl },
            footer: `You are receiving this email because you own the ${d.tenantName} account on Ventea. It is a service notice about your subscription, not marketing.`,
          }
        : {
            subject: `Your Ventea trial has ended · ${d.tenantName}`,
            heading: 'Your trial has ended',
            paragraphs: [
              `The free trial of ${d.tenantName} ended on ${fmt(d.periodEnd)} and the brand stopped taking orders. Your dashboard and your data are still there.`,
              `To reactivate it, arrange the payment with the Ventea team: write to us at ${d.supportEmail} or check your plan in Billing.`,
            ],
            cta: { label: 'Go to Billing', url: d.billingUrl },
            footer: `You are receiving this email because you own the ${d.tenantName} account on Ventea. It is a service notice about your subscription, not marketing.`,
          };
    }
    return d.graceEndsAt
      ? {
          subject: `Pago pendiente de tu plan Ventea · ${d.tenantName}`,
          heading: 'Tu pago está pendiente',
          paragraphs: [
            `El período pagado de ${d.tenantName} terminó el ${fmt(d.periodEnd)} y todavía no registramos el pago. Tu menú y tus pedidos siguen funcionando hasta el ${fmt(d.graceEndsAt)}; después, la marca deja de recibir pedidos hasta que se regularice.`,
            `El pago se coordina con el equipo de Ventea (no se cobra solo): escríbenos a ${d.supportEmail} o revisa tu plan en Facturación.`,
          ],
          cta: { label: 'Ir a Facturación', url: d.billingUrl },
          footer: `Recibes este correo porque eres dueño de la cuenta de ${d.tenantName} en Ventea. Es un aviso del servicio sobre tu suscripción, no publicidad.`,
        }
      : {
          subject: `Tu prueba de Ventea terminó · ${d.tenantName}`,
          heading: 'Tu prueba terminó',
          paragraphs: [
            `La prueba gratis de ${d.tenantName} terminó el ${fmt(d.periodEnd)} y la marca dejó de recibir pedidos. Tu panel y tus datos siguen ahí.`,
            `Para reactivarla, coordina el pago con el equipo de Ventea: escríbenos a ${d.supportEmail} o revisa tu plan en Facturación.`,
          ],
          cta: { label: 'Ir a Facturación', url: d.billingUrl },
          footer: `Recibes este correo porque eres dueño de la cuenta de ${d.tenantName} en Ventea. Es un aviso del servicio sobre tu suscripción, no publicidad.`,
        };
  },

  past_due_reminder: (d, lang, fmt) =>
    lang === 'en'
      ? {
          subject: `Reminder: payment pending for ${d.tenantName}`,
          heading: `${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} left to settle the payment`,
          paragraphs: [
            `Your menu and orders keep working until ${fmt(d.graceEndsAt)}. After that, ${d.tenantName} stops taking orders until the payment is settled.`,
            `Payment is arranged with the Ventea team (it is not charged automatically): write to us at ${d.supportEmail}. If you already paid, you can ignore this notice.`,
          ],
          cta: { label: 'Go to Billing', url: d.billingUrl },
          footer: `You are receiving this email because you own the ${d.tenantName} account on Ventea. It is a service notice about your subscription, not marketing.`,
        }
      : {
          subject: `Recordatorio: pago pendiente de ${d.tenantName}`,
          heading: `${d.daysLeft === 1 ? 'Queda 1 día' : `Quedan ${d.daysLeft} días`} para regularizar el pago`,
          paragraphs: [
            `Tu menú y tus pedidos funcionan hasta el ${fmt(d.graceEndsAt)}. Después, ${d.tenantName} deja de recibir pedidos hasta que se regularice el pago.`,
            `El pago se coordina con el equipo de Ventea (no se cobra solo): escríbenos a ${d.supportEmail}. Si ya pagaste, ignora este aviso.`,
          ],
          cta: { label: 'Ir a Facturación', url: d.billingUrl },
          footer: `Recibes este correo porque eres dueño de la cuenta de ${d.tenantName} en Ventea. Es un aviso del servicio sobre tu suscripción, no publicidad.`,
        },
};

export function isEmailKind(kind: string): kind is EmailKind {
  return Object.hasOwn(TEMPLATES, kind);
}

/**
 * Arma el correo. Tira si el tipo no existe o los datos no cumplen su schema (error
 * permanente: el despachador lo marca `failed` sin reintentar).
 */
export function renderEmail(
  kind: string,
  language: BrandLanguage,
  payload: unknown,
): RenderedEmail {
  if (!isEmailKind(kind)) throw new Error(`Tipo de correo desconocido: ${kind}`);
  const parsed = TEMPLATE_DATA[kind].safeParse(payload);
  if (!parsed.success) throw new Error(`Datos inválidos para el correo ${kind}`);
  const data = sanitizeNames(parsed.data as Record<string, unknown>);
  const lang: BrandLanguage = kind === 'app_request' ? 'es' : language;
  const fmt = dateFormatter(lang, (data as { timeZone: string }).timeZone);
  const build = TEMPLATES[kind] as (
    d: Record<string, unknown>,
    l: BrandLanguage,
    f: (iso: string) => string,
  ) => EmailContent;
  return layout(build(data, lang, fmt), lang);
}

/** Nombres de una sola línea: un `\n` en el nombre de la marca no arma párrafos ni headers. */
function sanitizeNames(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const key of ['tenantName', 'ownerName', 'planName', 'slug'] as const) {
    if (typeof out[key] === 'string') out[key] = inlineText(out[key]);
  }
  return out;
}

function dateFormatter(lang: BrandLanguage, timeZone: string): (iso: string) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es', {
      dateStyle: 'long',
      timeZone,
    });
  } catch {
    // Zona inválida en la marca: UTC antes que no mandar el aviso.
    format = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es', {
      dateStyle: 'long',
      timeZone: 'UTC',
    });
  }
  return (iso) => format.format(new Date(iso));
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape de texto para HTML (contenido y atributos entre comillas). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** `https:` siempre; `http:` solo a localhost (desarrollo). Nada de `javascript:` ni `data:`. */
export function isSafeLink(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

const COLORS = {
  ink: '#0b1220',
  paper: '#f6f7f9',
  accent: '#0f766e',
  muted: '#5b6472',
  line: '#e5e7eb',
};

function layout(content: EmailContent, lang: BrandLanguage): RenderedEmail {
  const subject = headerText(content.subject);

  const textParts = [content.heading, '', ...content.paragraphs.flatMap((p) => [p, ''])];
  if (content.steps?.length) {
    textParts.push(...content.steps.map((step, index) => `${index + 1}. ${step}`), '');
  }
  if (content.cta) textParts.push(`${content.cta.label}: ${content.cta.url}`, '');
  textParts.push('—', content.footer, 'Ventea · ventea.tech');
  const text = textParts.join('\n');

  const p = (inner: string) => `<p style="margin:0 0 14px">${inner}</p>`;
  const body = [
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${COLORS.ink}">${escapeHtml(content.heading)}</h1>`,
    ...content.paragraphs.map((paragraph) => p(escapeHtml(paragraph))),
    content.steps?.length
      ? `<ol style="margin:0 0 16px;padding-left:20px">${content.steps
          .map((step) => `<li style="margin:0 0 6px">${escapeHtml(step)}</li>`)
          .join('')}</ol>`
      : '',
    content.cta
      ? `<p style="margin:20px 0 8px"><a href="${escapeHtml(content.cta.url)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(content.cta.label)}</a></p>` +
        `<p style="margin:0 0 8px;font-size:12px;color:${COLORS.muted};word-break:break-all">${escapeHtml(content.cta.url)}</p>`
      : '',
  ].join('');

  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.line};border-radius:12px">
<tr><td style="padding:24px 28px 0;font-size:20px;font-weight:700;color:${COLORS.accent}">Ventea</td></tr>
<tr><td style="padding:16px 28px 8px;font-size:15px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;line-height:1.5;color:${COLORS.muted};border-top:1px solid ${COLORS.line}">${escapeHtml(content.footer)}<br>Ventea · ventea.tech</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
