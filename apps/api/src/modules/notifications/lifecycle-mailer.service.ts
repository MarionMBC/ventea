import { Inject, Injectable, Logger } from '@nestjs/common';

import { MailService, type EnqueueMail } from '@/modules/mail/mail.service';
import { MailSettings } from '@/modules/mail/mail.settings';
import { brandLanguage } from '@/modules/push/push-messages';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { PRISMA } from '@/prisma/prisma.module';

import { lifecycleEmailDue } from './lifecycle-rules';

/** Un solo job de correos de ciclo de vida a la vez entre réplicas. */
export const LIFECYCLE_LOCK = 'ventea:mail:lifecycle';
/** Con > 10 admins de plataforma, el aviso va a los 10 más antiguos (o use PLATFORM_ALERT_EMAILS). */
const MAX_PLATFORM_RECIPIENTS = 10;

export type LifecycleRun = { locked: false } | { locked: true; enqueued: number };

/**
 * Avisos de la plataforma y de ciclo de vida de la marca (TASK-021):
 *
 * 1. `appRequested`: el dueño pidió su app → a `PLATFORM_ALERT_EMAILS` (o a los admins).
 * 2. `welcome`: alta self-service → bienvenida al dueño.
 * 3. y 4. `runLifecycle`: prueba por vencer y pago pendiente, por barrido (`lifecycleEmailDue`).
 *
 * 1 y 2 salen del request en segundo plano: nunca lo demoran ni lo hacen fallar. Ninguno lleva
 * datos de pedidos ni de clientes finales.
 */
@Injectable()
export class LifecycleMailer {
  private readonly logger = new Logger(LifecycleMailer.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly mail: MailService,
    private readonly settings: MailSettings,
  ) {}

  appRequested(tenantId: string): void {
    this.mail.enqueueInBackground('app_request', async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          slug: true,
          name: true,
          timezone: true,
          appConfig: { select: { requestedAt: true } },
          subscription: { select: { plan: { select: { name: true } } } },
        },
      });
      const requestedAt = tenant?.appConfig?.requestedAt;
      if (!tenant || !requestedAt) return [];
      const recipients = await this.platformRecipients();
      if (recipients.length === 0) {
        this.logger.warn(
          'Solicitud de app sin destinatarios: no hay PLATFORM_ALERT_EMAILS ni admins',
        );
      }
      return recipients.map((to): EnqueueMail => ({
        kind: 'app_request',
        to,
        language: 'es',
        tenantId,
        dedupeKey: `app_request:${tenantId}:${requestedAt.getTime()}:${to}`,
        payload: {
          tenantName: tenant.name,
          slug: tenant.slug,
          planName: tenant.subscription?.plan.name ?? null,
          requestedAt: requestedAt.toISOString(),
          queueUrl: this.settings.platformUrl('/apps'),
          appUrl: this.settings.platformUrl(`/marcas/${tenant.slug}/app`),
          timeZone: tenant.timezone,
          supportEmail: this.settings.from.address,
        },
      }));
    });
  }

  welcome(tenantId: string): void {
    this.mail.enqueueInBackground('welcome', async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          slug: true,
          name: true,
          timezone: true,
          branding: { select: { language: true } },
          subscription: { select: { status: true, trialEndsAt: true } },
          staff: {
            where: { role: 'owner', isActive: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { email: true, name: true },
          },
        },
      });
      const owner = tenant?.staff[0];
      if (!tenant || !owner) return [];
      const trialEndsAt =
        tenant.subscription?.status === 'trialing' ? tenant.subscription.trialEndsAt : null;
      return [
        {
          kind: 'welcome',
          to: owner.email,
          language: brandLanguage(tenant.branding?.language),
          tenantId,
          dedupeKey: `welcome:${tenantId}`,
          payload: {
            tenantName: tenant.name,
            ownerName: owner.name,
            panelUrl: this.settings.tenantUrl(tenant.slug, '/admin'),
            menuUrl: this.settings.tenantUrl(tenant.slug),
            trialEndsAt: trialEndsAt?.toISOString() ?? null,
            timeZone: tenant.timezone,
            supportEmail: this.settings.from.address,
          },
        },
      ];
    });
  }

  /**
   * Una vuelta del job de prueba por vencer / pago pendiente. Con `pg_try_advisory_xact_lock`:
   * si otra réplica lo está corriendo, devuelve `locked: false` sin hacer nada. Los correos se
   * insertan en la misma transacción; el despacho arranca después del commit.
   */
  async runLifecycle(now = new Date()): Promise<LifecycleRun> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${LIFECYCLE_LOCK})) AS locked`;
        if (!row?.locked) return { locked: false } as const;
        return { locked: true, enqueued: await this.enqueueLifecycle(tx, now) } as const;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    if (result.locked && result.enqueued > 0) this.mail.kick();
    return result;
  }

  private async enqueueLifecycle(tx: PrismaDb, now: Date): Promise<number> {
    const day = 24 * 60 * 60 * 1000;
    const tenants = await tx.tenant.findMany({
      where: {
        isActive: true,
        subscription: {
          is: {
            OR: [
              {
                status: 'trialing',
                trialEndsAt: { gt: now, lte: new Date(now.getTime() + 3 * day) },
              },
              // Gracia de 7 días (o aviso de prueba vencida reciente): con 8 sobra.
              {
                status: 'past_due',
                currentPeriodEnd: { gte: new Date(now.getTime() - 8 * day), lte: now },
              },
            ],
          },
        },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        branding: { select: { language: true } },
        subscription: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true } },
        staff: { where: { role: 'owner', isActive: true }, select: { email: true } },
      },
    });

    let enqueued = 0;
    for (const tenant of tenants) {
      if (!tenant.subscription) continue;
      const due = lifecycleEmailDue(tenant.subscription, now);
      if (!due) continue;
      const common = {
        tenantName: tenant.name,
        billingUrl: this.settings.tenantUrl(tenant.slug, '/admin/facturacion'),
        timeZone: tenant.timezone,
        supportEmail: this.settings.from.address,
      };
      for (const { email } of tenant.staff) {
        const base = {
          to: email,
          language: brandLanguage(tenant.branding?.language),
          tenantId: tenant.id,
          dedupeKey: `${due.kind}:${tenant.id}:${due.occurrence}:${email.toLowerCase()}`,
        };
        let mail: EnqueueMail;
        switch (due.kind) {
          case 'trial_ending':
            mail = {
              ...base,
              kind: due.kind,
              payload: {
                ...common,
                daysLeft: due.daysLeft,
                trialEndsAt: due.trialEndsAt.toISOString(),
              },
            };
            break;
          case 'past_due':
            mail = {
              ...base,
              kind: due.kind,
              payload: {
                ...common,
                periodEnd: due.periodEnd.toISOString(),
                graceEndsAt: due.graceEndsAt?.toISOString() ?? null,
              },
            };
            break;
          case 'past_due_reminder':
            mail = {
              ...base,
              kind: due.kind,
              payload: {
                ...common,
                graceEndsAt: due.graceEndsAt.toISOString(),
                daysLeft: due.daysLeft,
              },
            };
            break;
        }
        try {
          if (await this.mail.enqueue(mail, tx)) enqueued++;
        } catch (error) {
          // Un dueño con un correo que no valida no frena los avisos del resto.
          this.logger.warn(
            `Correo ${due.kind} de la marca ${tenant.id} no encolado: ${(error as Error).message}`,
          );
        }
      }
    }
    return enqueued;
  }

  private async platformRecipients(): Promise<string[]> {
    if (this.settings.platformAlertEmails.length > 0) return this.settings.platformAlertEmails;
    const admins = await this.prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'asc' },
      take: MAX_PLATFORM_RECIPIENTS,
      select: { email: true },
    });
    return admins.map((admin) => admin.email.toLowerCase());
  }
}
