import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  AuthTokens,
  CustomerAuthResponse,
  LoginInput,
  RegisterInput,
  StaffAuthResponse,
  TenantContext,
  TenantRole,
} from '@ventea/shared';
import argon2 from 'argon2';

import { CUSTOMER_SELECT, toCustomer } from '@/modules/customers/customer.mapper';
import { RewardsService } from '@/modules/rewards/rewards.service';
import type { PrismaClientExtended } from '@/prisma/prisma.client';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { TokenService } from './token.service';

/** Lo que hace falta de un `StaffMember` para abrirle sesión. */
export const STAFF_SESSION_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  tokenVersion: true,
} as const;

export interface StaffSessionRow {
  id: string;
  email: string;
  name: string;
  role: TenantRole;
  tokenVersion: number;
}

/** Mismo mensaje para email inexistente y clave incorrecta: no se puede enumerar cuentas. */
const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

@Injectable()
export class AuthService {
  /**
   * Hash de relleno: cuando el email no existe se verifica igual contra este hash,
   * para que la respuesta tarde lo mismo que con una clave incorrecta.
   */
  private dummyHash?: Promise<string>;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly tokens: TokenService,
    private readonly rewards: RewardsService,
  ) {}

  async register(tenant: TenantContext, input: RegisterInput): Promise<CustomerAuthResponse> {
    const passwordHash = await argon2.hash(input.password);

    let customer;
    try {
      customer = await this.prisma.$transaction(async (tx) => {
        const created = await tx.customer.create({
          data: {
            tenantId: tenant.tenantId,
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone ?? null,
          },
          select: CUSTOMER_SELECT,
        });
        await this.rewards.grantSignupBonus(tx, tenant.tenantId, created.id);
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe una cuenta con ese email');
      }
      throw error;
    }

    const tokens = await this.tokens.issuePair({
      subject: customer.id,
      tenantId: tenant.tenantId,
      kind: 'customer',
    });
    return { ...tokens, customer: toCustomer(customer) };
  }

  async login(tenant: TenantContext, input: LoginInput): Promise<CustomerAuthResponse> {
    const customer = await this.prisma.customer.findFirst({
      where: { tenantId: tenant.tenantId, email: input.email },
      select: { ...CUSTOMER_SELECT, passwordHash: true },
    });

    if (
      !(await this.passwordMatches(customer?.passwordHash ?? null, input.password)) ||
      !customer
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const tokens = await this.tokens.issuePair({
      subject: customer.id,
      tenantId: tenant.tenantId,
      kind: 'customer',
    });
    return { ...tokens, customer: toCustomer(customer) };
  }

  async staffLogin(tenant: TenantContext, input: LoginInput): Promise<StaffAuthResponse> {
    const staff = await this.prisma.staffMember.findFirst({
      where: { tenantId: tenant.tenantId, email: input.email, isActive: true },
      select: { ...STAFF_SESSION_SELECT, passwordHash: true },
    });

    if (!(await this.passwordMatches(staff?.passwordHash ?? null, input.password)) || !staff) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.staffSession(tenant.tenantId, staff);
  }

  /**
   * Sesión del panel para un miembro ya verificado (login, invitación aceptada, contraseña
   * nueva). El token lleva su `tokenVersion`: subirlo la corta (TASK-022).
   */
  async staffSession(tenantId: string, staff: StaffSessionRow): Promise<StaffAuthResponse> {
    const tokens = await this.tokens.issuePair({
      subject: staff.id,
      tenantId,
      kind: 'staff',
      role: staff.role,
      tokenVersion: staff.tokenVersion,
    });
    return {
      ...tokens,
      staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role },
    };
  }

  /**
   * Canjea un refresh token por un par nuevo. Revisa que la cuenta siga existiendo
   * (y, en staff, activa y con su rol actual) antes de emitir.
   */
  async refresh(tenant: TenantContext, refreshToken: string): Promise<AuthTokens> {
    const claims = await this.tokens.verify(refreshToken, 'refresh');
    if (!claims || claims.tid !== tenant.tenantId) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    if (claims.kind === 'customer') {
      const customer = await this.prisma.customer.findFirst({
        where: { tenantId: tenant.tenantId, id: claims.sub },
        select: { id: true },
      });
      if (!customer) throw new UnauthorizedException('Sesión inválida o expirada');
      return this.tokens.issuePair({
        subject: customer.id,
        tenantId: tenant.tenantId,
        kind: 'customer',
      });
    }

    const staff = await this.prisma.staffMember.findFirst({
      where: { tenantId: tenant.tenantId, id: claims.sub, isActive: true },
      select: { id: true, role: true, tokenVersion: true },
    });
    // Rol cambiado, desactivado o contraseña nueva (TASK-022): el refresh viejo ya no sirve.
    if (!staff || staff.tokenVersion !== (claims.ver ?? 0)) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    return this.tokens.issuePair({
      subject: staff.id,
      tenantId: tenant.tenantId,
      kind: 'staff',
      role: staff.role,
      tokenVersion: staff.tokenVersion,
    });
  }

  private async passwordMatches(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= argon2.hash('ventea-dummy-password');
      await argon2.verify(await this.dummyHash, password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Hash corrupto o de otro algoritmo: se trata como clave incorrecta.
      return false;
    }
  }
}
