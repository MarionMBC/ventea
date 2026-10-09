import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  BrandLanguage,
  EmailKind,
  PlatformEmail,
  PlatformEmailList,
  PlatformEmailsQuery,
} from '@ventea/shared';

import { redactSensitive } from '@/common/logging/redact';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { parseRecipient } from './mail-address';
import { renderEmail, SECRET_LINK_KINDS, type EmailTemplateData } from './mail-templates';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport';
import { MailSettings } from './mail.settings';

/** Un correo para encolar. `payload` son los datos de la plantilla de `kind`. */
export type EnqueueMail = {
  [K in EmailKind]: {
    kind: K;
    payload: EmailTemplateData[K];
    /** Destinatario: UNA dirección. Se valida (formato, sin CR/LF); inválida → tira. */
    to: string;
    /** Idioma de la plantilla (el de la marca). `app_request` va siempre en español. */
    language: BrandLanguage;
    /**
     * Clave de idempotencia, única en toda la outbox: el mismo evento repetido (reintento,
     * doble clic, dos réplicas, el job corriendo dos veces) no genera un segundo correo.
     * Convención: `<kind>:<tenantId>:<lo que identifica la ocurrencia>:<destinatario>`.
     */
    dedupeKey: string;
    tenantId?: string | null;
  };
}[EmailKind];

/** Intentos totales antes de `failed` (1 + 4 reintentos). */
export const MAX_ATTEMPTS = 5;
/** Espera antes del reintento n (tras el intento n). */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
/** Un `sending` más viejo que esto es un despachador que murió a mitad: vuelve a la cola. */
const STALE_SENDING_MS = 10 * 60_000;
const STALE_ERROR = 'Envío interrumpido: el proceso se cortó a mitad del envío';
/**
 * Cuánto espera el apagado al envío en curso (un SMTP lento tarda hasta ~40 s: 10+10+20 de
 * timeouts). Nest corre los `beforeApplicationShutdown` en serie: cobro (35 s) + correo (30 s)
 * = 65 s, dentro del `stop_grace_period: 75s` de los compose. Si se corta igual, la fila queda
 * `sending` y vuelve a la cola como intento interrumpido.
 */
export const SHUTDOWN_WAIT_MS = 30_000;
const BATCH_SIZE = 20;
const MAX_ERROR_LENGTH = 300;

/**
 * Correos transaccionales (TASK-021). API pública para cualquier feature:
 *
 * - `enqueue(mail, db?)`: valida e inserta en la outbox (idempotente por `dedupeKey`) y despierta
 *   al despachador. Con `db` = un `tx`, el correo nace en la misma transacción que el hecho que
 *   lo dispara; llamar `kick()` después del commit (si no, sale en la próxima vuelta, ≤ 60 s).
 * - `enqueueInBackground(label, build)`: fire-and-forget para el camino de un request: arma y
 *   encola DESPUÉS de responder; un error se loguea y nunca llega al request.
 * - `kick()`: despacha lo pendiente ahora (asíncrono).
 *
 * El envío es asíncrono, con reintentos acotados (`MAX_ATTEMPTS`, espera creciente) y un tope de
 * `MAIL_RATE_LIMIT_PER_MINUTE` envíos por minuto y proceso. Sin SMTP (`SMTP_URL` vacía) cada
 * correo queda `skipped`. Los logs nunca llevan destinatarios ni cuerpos: solo id y tipo.
 */
@Injectable()
export class MailService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(MailService.name);
  private readonly inFlight = new Set<Promise<unknown>>();
  private dispatching?: Promise<void>;
  private dispatchAgain = false;
  /** Apagándose: no se toman correos nuevos (el envío en curso termina). */
  private stopping = false;
  private readonly sentAt: number[] = [];
  private rateTimer?: NodeJS.Timeout;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly settings: MailSettings,
  ) {}

  /** `true` si se creó; `false` si ya existía uno con esa `dedupeKey`. */
  async enqueue(mail: EnqueueMail, db?: PrismaDb): Promise<boolean> {
    const to = parseRecipient(mail.to);
    if (!to) throw new Error(`Destinatario inválido para el correo ${mail.kind}`);
    if (!/^[\x21-\x7e]{1,500}$/.test(mail.dedupeKey)) {
      throw new Error(`dedupeKey inválida para el correo ${mail.kind}`);
    }
    // Se arma ya: datos inválidos fallan acá (en el llamador), no horas después en el envío.
    const { subject } = renderEmail(mail.kind, mail.language, mail.payload, this.settings.links);
    const { count } = await (db ?? this.prisma).emailMessage.createMany({
      data: [
        {
          tenantId: mail.tenantId ?? null,
          kind: mail.kind,
          to,
          subject,
          language: mail.language,
          payload: mail.payload as Prisma.InputJsonValue,
          dedupeKey: mail.dedupeKey,
        },
      ],
      skipDuplicates: true,
    });
    if (count > 0 && !db) this.kick();
    return count > 0;
  }

  /**
   * Arma y encola después de la respuesta (`setImmediate`), sin esperar ni propagar errores.
   * Para eventos que salen de un request: el correo nunca lo demora ni lo hace fallar.
   */
  enqueueInBackground(label: string, build: () => Promise<EnqueueMail[]>): void {
    this.track(
      new Promise<void>((resolve) => {
        setImmediate(() => {
          build()
            .then(async (mails) => {
              for (const mail of mails) await this.enqueue(mail);
            })
            .catch((error: unknown) => {
              this.logger.error(
                `No se pudo encolar el correo ${label}: ${maskEmails(describe(error))}`,
              );
            })
            .finally(resolve);
        });
      }),
    );
  }

  /** Despacha lo pendiente sin esperar. Si ya hay una vuelta en curso, la repite al terminar. */
  kick(): void {
    if (this.stopping) return;
    if (this.dispatching) {
      this.dispatchAgain = true;
      return;
    }
    const run = (async () => {
      do {
        this.dispatchAgain = false;
        await this.dispatchPending();
      } while (this.dispatchAgain);
    })()
      .catch((error: unknown) => {
        this.logger.error(`Despacho de correos falló: ${describe(error)}`);
      })
      .finally(() => {
        this.dispatching = undefined;
      });
    this.dispatching = run;
    this.track(run);
  }

  /**
   * Una vuelta de despacho: toma los vencidos (`nextAttemptAt <= now`) de a uno con un update
   * condicional (`pending → sending`), así dos réplicas nunca mandan el mismo. Devuelve cuántos
   * procesó. `now` es inyectable para probar reintentos sin esperar.
   */
  async dispatchPending(now = new Date()): Promise<number> {
    await this.reclaimStale(now);

    let processed = 0;
    while (!this.stopping) {
      const budget = this.transport.configured ? this.remainingBudget() : BATCH_SIZE;
      if (budget <= 0) {
        this.scheduleAfterRateWindow();
        break;
      }
      const due = await this.prisma.emailMessage.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
        take: Math.min(budget, BATCH_SIZE),
        select: { id: true },
      });
      if (due.length === 0) break;
      for (const { id } of due) {
        if (this.stopping) break;
        const { count } = await this.prisma.emailMessage.updateMany({
          where: { id, status: 'pending' },
          data: { status: 'sending' },
        });
        if (count === 1) {
          await this.deliver(id, now);
          processed++;
        }
      }
    }
    return processed;
  }

  /**
   * Un `sending` viejo es un envío que se cortó a mitad (el proceso murió): ese intento cuenta.
   * Vuelve a la cola con la espera del reintento, o queda `failed` si era el último: un correo
   * que tumba al proceso no se reintenta para siempre. Condicional sobre `updatedAt`: si dos
   * réplicas lo ven a la vez, solo una lo mueve.
   */
  private async reclaimStale(now: Date): Promise<void> {
    const stale = await this.prisma.emailMessage.findMany({
      where: { status: 'sending', updatedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
      select: { id: true, attempts: true, updatedAt: true },
      take: 100,
    });
    for (const row of stale) {
      const attempts = row.attempts + 1;
      const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 0;
      const { count } = await this.prisma.emailMessage.updateMany({
        where: { id: row.id, status: 'sending', updatedAt: row.updatedAt },
        data:
          attempts >= MAX_ATTEMPTS
            ? { status: 'failed', attempts, error: STALE_ERROR }
            : {
                status: 'pending',
                attempts,
                error: STALE_ERROR,
                nextAttemptAt: new Date(now.getTime() + delay),
              },
      });
      if (count === 1)
        this.logger.warn(`Correo ${row.id}: envío interrumpido (intento ${attempts})`);
    }
  }

  /** Plataforma: vuelve a encolar un correo `failed` (404 si no existe, 409 si no falló). */
  async resend(id: string): Promise<PlatformEmail> {
    const { count } = await this.prisma.emailMessage.updateMany({
      where: { id, status: 'failed' },
      data: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), error: null },
    });
    if (count === 0) {
      const exists = await this.prisma.emailMessage.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!exists) throw new NotFoundException('Correo no encontrado');
      throw new ConflictException(`Solo se reenvía un correo fallido (estado: ${exists.status})`);
    }
    this.kick();
    const row = await this.prisma.emailMessage.findUniqueOrThrow({
      where: { id },
      include: { tenant: { select: { slug: true, name: true } } },
    });
    return toPlatformEmail(row);
  }

  /** Plataforma: últimos correos, sin el cuerpo. */
  async list(query: PlatformEmailsQuery): Promise<PlatformEmailList> {
    const rows = await this.prisma.emailMessage.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: { tenant: { select: { slug: true, name: true } } },
    });
    return {
      transport: this.transport.configured ? 'smtp' : 'none',
      items: rows.map(toPlatformEmail),
    };
  }

  /** Espera lo que está en curso (encolados en segundo plano y despachos). Tests y apagado. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  /** Antes de que se cierre Prisma: termina (con tope) lo que está en vuelo. */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.rateTimer) clearTimeout(this.rateTimer);
    await Promise.race([
      this.drain(),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS)),
    ]);
  }

  private async deliver(id: string, now: Date): Promise<void> {
    const message = await this.prisma.emailMessage.findUniqueOrThrow({ where: { id } });
    const attempts = message.attempts + 1;

    if (!this.transport.configured) {
      await this.prisma.emailMessage.update({
        where: { id },
        data: { status: 'skipped', error: null, ...withoutSecretLink(message) },
      });
      this.logger.log(`Correo ${message.kind} ${id} registrado sin enviar: SMTP no configurado`);
      return;
    }

    let rendered: ReturnType<typeof renderEmail>;
    try {
      rendered = renderEmail(
        message.kind,
        message.language === 'en' ? 'en' : 'es',
        message.payload,
        this.settings.links,
      );
    } catch (error) {
      // Datos que no arman el correo: reintentar no lo arregla.
      await this.fail(id, attempts, describe(error), true, now);
      return;
    }

    try {
      this.sentAt.push(Date.now());
      await this.transport.send({
        from: this.settings.from,
        to: message.to,
        subject: message.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (error) {
      await this.fail(id, attempts, describe(error), attempts >= MAX_ATTEMPTS, now);
      return;
    }
    await this.prisma.emailMessage.update({
      where: { id },
      data: {
        status: 'sent',
        attempts,
        sentAt: new Date(),
        error: null,
        ...withoutSecretLink(message),
      },
    });
    this.logger.log(`Correo ${message.kind} ${id} enviado`);
  }

  private async fail(
    id: string,
    attempts: number,
    reason: string,
    permanent: boolean,
    now: Date,
  ): Promise<void> {
    const error = redactSensitive(reason).slice(0, MAX_ERROR_LENGTH);
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 0;
    await this.prisma.emailMessage.update({
      where: { id },
      data: permanent
        ? { status: 'failed', attempts, error }
        : { status: 'pending', attempts, error, nextAttemptAt: new Date(now.getTime() + delay) },
    });
    this.logger.warn(
      `Correo ${id}: intento ${attempts} falló${permanent ? ' (definitivo)' : ''}: ${maskEmails(error)}`,
    );
  }

  /** Envíos que quedan en la ventana del último minuto. */
  private remainingBudget(): number {
    const windowStart = Date.now() - 60_000;
    while (this.sentAt.length > 0 && (this.sentAt[0] ?? 0) < windowStart) this.sentAt.shift();
    return this.settings.ratePerMinute - this.sentAt.length;
  }

  /** Sin cupo: vuelve a despachar cuando se libere el envío más viejo de la ventana. */
  private scheduleAfterRateWindow(): void {
    if (this.rateTimer) return;
    const wait = Math.max(1_000, (this.sentAt[0] ?? Date.now()) + 60_000 - Date.now());
    this.rateTimer = setTimeout(() => {
      this.rateTimer = undefined;
      this.kick();
    }, wait);
    this.rateTimer.unref();
  }

  private track(task: Promise<unknown>): void {
    this.inFlight.add(task);
    void task.finally(() => this.inFlight.delete(task));
  }
}

/**
 * Correo con un link secreto de un solo uso (TASK-022) que ya no se va a reenviar (`sent` o
 * `skipped`): el payload guardado pierde el link, así la outbox no conserva tokens válidos. Un
 * `failed` lo conserva porque la plataforma puede reenviarlo (vence igual a las 72 h).
 */
function withoutSecretLink(message: { kind: string; payload: Prisma.JsonValue }): {
  payload?: Prisma.InputJsonValue;
} {
  const key = (SECRET_LINK_KINDS as Record<string, string | undefined>)[message.kind];
  const payload = message.payload;
  if (!key || !payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return { payload: { ...payload, [key]: '[redacted]' } as Prisma.InputJsonValue };
}

/** Los logs no llevan direcciones (un rechazo SMTP suele citar al destinatario). */
export function maskEmails(text: string): string {
  return text.replace(/[^\s<>"'@]+@[^\s<>"']+/g, '[email]');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type EmailRow = Prisma.EmailMessageGetPayload<{
  include: { tenant: { select: { slug: true; name: true } } };
}>;

function toPlatformEmail(row: EmailRow): PlatformEmail {
  return {
    id: row.id,
    kind: row.kind,
    to: row.to,
    subject: row.subject,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    tenant: row.tenant ? { slug: row.tenant.slug, name: row.tenant.name } : null,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}
