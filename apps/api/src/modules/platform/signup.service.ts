import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_REWARD_PROGRAM,
  isReservedTenantSlug,
  tenantSlugSchema,
  type Plan,
  type SignupInput,
  type SignupResponse,
  type SlugAvailability,
} from '@ventea/shared';
import argon2 from 'argon2';

import { addDays, TRIAL_DAYS } from '@/modules/subscriptions/subscription-state';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { toPlan } from './platform.mapper';
import { RegionService } from './region.service';

const SLUG_TAKEN = 'Ese subdominio ya está en uso';
export const SIGNUP_CLOSED = 'Registro temporalmente cerrado, escríbenos';

/**
 * Cupo GLOBAL de altas self-service (TASK-004 review). Cada alta es un certificado
 * Let's Encrypt HTTP-01 y Let's Encrypt da 50 por dominio y semana: sin tope, un abuso
 * desde muchas IPs (el rate limit es por IP) dejaría sin certificado a marcas reales.
 * Se cuenta en la base (no en memoria): vale entre reinicios y entre réplicas.
 */
const DEFAULT_SIGNUP_WEEKLY_LIMIT = 25;
const DEFAULT_SIGNUP_DAILY_LIMIT = 10;
/** Clave del advisory lock que serializa las altas para que el cupo no se pase por carrera. */
const SIGNUP_LOCK_KEY = 'ventea:signup-quota';

/**
 * Registro self-service de una marca (ADR 0007): la deja completa y en prueba de
 * `TRIAL_DAYS` días, lista para entrar al panel.
 */
@Injectable()
export class SignupService {
  private readonly baseDomain: string;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly regions: RegionService,
    private readonly config: ConfigService,
  ) {
    this.baseDomain = config.get<string>('TENANT_BASE_DOMAIN') || 'ventea.tech';
  }

  async listPlans(): Promise<Plan[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthlyCents: 'asc' },
    });
    return plans.map(toPlan).filter((plan): plan is Plan => plan !== null);
  }

  async slugAvailability(raw: string): Promise<SlugAvailability> {
    const slug = tenantSlugSchema.safeParse(raw);
    if (!slug.success) return { available: false, reason: 'invalid' };
    if (isReservedTenantSlug(slug.data)) return { available: false, reason: 'reserved' };
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: slug.data },
      select: { id: true },
    });
    return existing ? { available: false, reason: 'taken' } : { available: true };
  }

  /**
   * Crea en una transacción: tenant, branding, programa de puntos por defecto, la
   * sucursal «Sucursal principal», el dueño con la contraseña elegida, la suscripción en
   * prueba y el asiento `trial_started`.
   *
   * `headerCountry` es el país que informa el proxy (`CF-IPCountry` / `X-Country`); el del
   * body, si viene, manda.
   */
  async signup(input: SignupInput, headerCountry?: string): Promise<SignupResponse> {
    if (input.website) {
      // Honeypot lleno: un bot. Mismo 400 genérico que cualquier dato inválido.
      throw new BadRequestException('Datos inválidos');
    }
    if (isReservedTenantSlug(input.slug)) {
      throw new BadRequestException(`"${input.slug}" es un subdominio reservado`);
    }

    const plan = await this.prisma.plan.findFirst({
      where: { code: input.planCode, isActive: true },
      select: { id: true },
    });
    if (!plan) throw new BadRequestException('Plan no disponible');

    // Antes del hash (argon2 es caro a propósito): el caso común de slug tomado no lo paga.
    const taken = await this.prisma.tenant.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (taken) throw new ConflictException(SLUG_TAKEN);

    const region = this.regions.assign(input.country ?? headerCountry);
    const passwordHash = await argon2.hash(input.ownerPassword);
    const now = new Date();
    const trialEndsAt = addDays(now, TRIAL_DAYS);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertSignupQuota(tx, now);
        const tenant = await tx.tenant.create({
          data: {
            slug: input.slug,
            name: input.restaurantName,
            currency: input.currency ?? region.currency,
            timezone: region.timezone,
            region: region.code,
            createdVia: 'signup',
            branding: { create: { appDisplayName: input.restaurantName } },
            rewardProgram: { create: { ...DEFAULT_REWARD_PROGRAM } },
            staff: {
              create: {
                email: input.ownerEmail,
                passwordHash,
                name: input.ownerName,
                role: 'owner',
              },
            },
            subscription: {
              create: {
                planId: plan.id,
                interval: input.interval,
                status: 'trialing',
                trialEndsAt,
                currentPeriodStart: now,
                currentPeriodEnd: trialEndsAt,
              },
            },
            billingEvents: {
              create: {
                type: 'trial_started',
                message: `Prueba de ${TRIAL_DAYS} días · plan ${input.planCode} (${input.interval})`,
              },
            },
          },
          select: { id: true },
        });

        await tx.location.create({
          data: {
            tenantId: tenant.id,
            name: 'Sucursal principal',
            address: 'Por definir',
            latitude: 0,
            longitude: 0,
            openingHours: [],
          },
        });
      });
    } catch (error) {
      // Dos registros simultáneos con el mismo slug: el segundo choca con el unique.
      if (isUniqueViolation(error)) throw new ConflictException(SLUG_TAKEN);
      throw error;
    }

    const url = `https://${input.slug}.${this.baseDomain}`;
    return {
      tenant: { slug: input.slug, url, adminUrl: `${url}/admin`, region: region.code },
      trialEndsAt,
    };
  }

  /**
   * 429 si ya se alcanzó el cupo de altas self-service de las últimas 24 h o 7 días.
   * Dentro de la transacción del alta y tras un advisory lock: dos registros simultáneos
   * no pueden contar ambos "queda uno".
   */
  private async assertSignupQuota(tx: PrismaDb, now: Date): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${SIGNUP_LOCK_KEY}))`;
    const [weekly, daily] = await Promise.all([
      tx.tenant.count({ where: { createdVia: 'signup', createdAt: { gte: addDays(now, -7) } } }),
      tx.tenant.count({ where: { createdVia: 'signup', createdAt: { gte: addDays(now, -1) } } }),
    ]);
    const weeklyLimit = this.limit('SIGNUP_WEEKLY_LIMIT', DEFAULT_SIGNUP_WEEKLY_LIMIT);
    const dailyLimit = this.limit('SIGNUP_DAILY_LIMIT', DEFAULT_SIGNUP_DAILY_LIMIT);
    if (weekly >= weeklyLimit || daily >= dailyLimit) {
      throw new HttpException(SIGNUP_CLOSED, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private limit(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  }
}
