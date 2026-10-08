import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
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
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { toPlan } from './platform.mapper';
import { RegionService } from './region.service';

const SLUG_TAKEN = 'Ese subdominio ya está en uso';

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
    config: ConfigService,
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
}
