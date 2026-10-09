import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AcceptInvitationInput,
  ConfirmPasswordResetInput,
  CreateInvitationInput,
  CreatedInvitation,
  InvitationPreview,
  PasswordResetPreview,
  StaffAuthResponse,
  Team,
  TeamInvitation,
  TeamLink,
  TeamLinkKind,
  TenantContext,
  UpdateMemberInput,
} from '@ventea/shared';
import argon2 from 'argon2';

import type { StaffPrincipal } from '@/common/auth/auth.context';
import { AuthService, STAFF_SESSION_SELECT } from '@/modules/auth/auth.service';
import { PlanLimitsService } from '@/modules/subscriptions/plan-limits.service';
import type { PrismaClientExtended, PrismaDb } from '@/prisma/prisma.client';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PRISMA } from '@/prisma/prisma.module';

import { memberChangeError, memberChanges } from './team-rules';
import { hashTeamToken, newTeamToken, teamLinkExpiry } from './team-tokens';

/** Mismo mensaje para enlace inexistente, de otra marca, vencido, usado o revocado. */
const INVALID_LINK = 'El enlace no es válido o ya venció. Pida uno nuevo al dueño de la marca.';
const ALREADY_MEMBER = 'Ese email ya es parte del equipo';
const ALREADY_MEMBER_INACTIVE = 'Ese email ya es parte del equipo (desactivado): reactívelo';

const INVITATION_SELECT = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
} as const;

const OWNER_RESET =
  'El enlace de contraseña no aplica a dueños: cada dueño cambia la suya desde su cuenta';

/**
 * Equipo de la marca (TASK-022): miembros, invitaciones y enlaces de contraseña nueva.
 *
 * Las escrituras corren en una transacción con un advisory lock por marca: el tope de usuarios
 * del plan y la regla «siempre un dueño activo» no se saltan por carrera. Cambiar el rol,
 * desactivar o poner contraseña nueva sube `tokenVersion`: las sesiones vivas del miembro
 * mueren en el acto (ver JwtAuthGuard).
 *
 * Enlaces: el token en claro se devuelve una vez (al dueño, que lo copia); la base guarda su
 * sha256. Un solo uso, 72 h, y uno nuevo revoca los anteriores del mismo email/miembro.
 */
@Injectable()
export class TeamService {
  /** Auditoría en el log: ids y tipo de acción; nunca emails, tokens ni contraseñas. */
  private readonly logger = new Logger('TeamAudit');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClientExtended,
    private readonly limits: PlanLimitsService,
    private readonly auth: AuthService,
  ) {}

  // ─── Dueño ──────────────────────────────────────────────────────────────────

  async team(actor: StaffPrincipal): Promise<Team> {
    const { tenantId } = actor;
    const now = new Date();
    const [members, invitations, usage] = await Promise.all([
      this.prisma.staffMember.findMany({
        where: { tenantId },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.staffInvitation.findMany({
        where: { tenantId, ...pending(now) },
        select: { ...INVITATION_SELECT, invitedById: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.limits.staffUsage(tenantId, this.prisma, now),
    ]);
    const names = new Map(members.map((member) => [member.id, member.name]));
    return {
      members: members.map((member) => ({ ...member, isSelf: member.id === actor.staffId })),
      invitations: invitations.map(({ invitedById, ...invitation }) => ({
        ...invitation,
        invitedByName: names.get(invitedById) ?? null,
      })),
      usage,
    };
  }

  async invite(actor: StaffPrincipal, input: CreateInvitationInput): Promise<CreatedInvitation> {
    const { tenantId } = actor;
    const { token, tokenHash } = newTeamToken();
    const now = new Date();
    const invitation = await this.prisma.$transaction(async (tx) => {
      await lock(tx, tenantId);
      const existing = await tx.staffMember.findFirst({
        where: { tenantId, email: input.email },
        select: { isActive: true },
      });
      if (existing) {
        throw new ConflictException(existing.isActive ? ALREADY_MEMBER : ALREADY_MEMBER_INACTIVE);
      }
      // Invitar de nuevo al mismo email = enlace nuevo: el anterior deja de servir y no ocupa
      // un segundo lugar del plan.
      await tx.staffInvitation.updateMany({
        where: { tenantId, email: input.email, ...pending(now) },
        data: { revokedAt: now },
      });
      await this.limits.assertCanAddStaff(tenantId, tx);
      return tx.staffInvitation.create({
        data: {
          tenantId,
          email: input.email,
          role: input.role,
          tokenHash,
          invitedById: actor.staffId,
          expiresAt: teamLinkExpiry(now),
        },
        select: INVITATION_SELECT,
      });
    });
    this.audit(actor, 'invitation_created', invitation.id);
    this.deliver(tenantId, 'invitation', invitation.email, token);
    return { invitation, token, expiresAt: invitation.expiresAt };
  }

  async revokeInvitation(actor: StaffPrincipal, id: string): Promise<void> {
    const { count } = await this.prisma.staffInvitation.updateMany({
      where: { tenantId: actor.tenantId, id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Invitación no encontrada');
    this.audit(actor, 'invitation_revoked', id);
  }

  async updateMember(actor: StaffPrincipal, id: string, input: UpdateMemberInput): Promise<void> {
    const { tenantId } = actor;
    const changed = await this.prisma.$transaction(async (tx) => {
      await lock(tx, tenantId);
      const member = await tx.staffMember.findFirst({
        where: { tenantId, id },
        select: { id: true, role: true, isActive: true },
      });
      if (!member) throw new NotFoundException('Miembro no encontrado');

      const otherOwners = await tx.staffMember.count({
        where: { tenantId, role: 'owner', isActive: true, id: { not: id } },
      });
      const error = memberChangeError(actor.staffId, member, input, otherOwners);
      if (error) throw new ConflictException(error);

      const data = memberChanges(member, input);
      if (Object.keys(data).length === 0) return null;
      if (data.isActive === true) await this.limits.assertCanAddStaff(tenantId, tx);

      await tx.staffMember.updateMany({
        where: { tenantId, id },
        data: { ...data, tokenVersion: { increment: 1 } },
      });
      if (data.isActive === false) {
        // Un enlace de contraseña pendiente no puede reabrir una cuenta desactivada.
        await tx.staffPasswordReset.updateMany({
          where: { tenantId, staffId: id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      // Un dueño que se desactiva o deja de serlo ya no respalda lo que emitió como dueño: sus
      // invitaciones y enlaces de contraseña pendientes dejan de servir (si no, quien se va se
      // queda con un enlace para entrar como otro miembro). Son los únicos artefactos con
      // autor dueño; sus sesiones ya caen por `tokenVersion`.
      if (member.role === 'owner' && (data.isActive === false || data.role !== undefined)) {
        const now = new Date();
        await tx.staffInvitation.updateMany({
          where: { tenantId, invitedById: id, ...pending(now) },
          data: { revokedAt: now },
        });
        await tx.staffPasswordReset.updateMany({
          where: { tenantId, createdById: id, usedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      return data;
    });
    // Después del commit: el log no dice que algo cambió si la transacción se deshizo.
    if (changed) this.audit(actor, 'member_updated', id, changed);
  }

  async createPasswordReset(actor: StaffPrincipal, id: string): Promise<TeamLink> {
    const { tenantId } = actor;
    if (id === actor.staffId) {
      throw new ConflictException('Su propia contraseña no se cambia con un enlace');
    }
    const { token, tokenHash } = newTeamToken();
    const now = new Date();
    const reset = await this.prisma.$transaction(async (tx) => {
      const member = await tx.staffMember.findFirst({
        where: { tenantId, id },
        select: { id: true, email: true, isActive: true, role: true },
      });
      if (!member) throw new NotFoundException('Miembro no encontrado');
      // Entre dueños no: un co-dueño no puede tomar la cuenta de otro con un enlace.
      if (member.role === 'owner') throw new ConflictException(OWNER_RESET);
      if (!member.isActive) {
        throw new ConflictException('El miembro está desactivado: reactívelo primero');
      }
      await tx.staffPasswordReset.updateMany({
        where: { tenantId, staffId: id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      const created = await tx.staffPasswordReset.create({
        data: {
          tenantId,
          staffId: id,
          tokenHash,
          createdById: actor.staffId,
          expiresAt: teamLinkExpiry(now),
        },
        select: { expiresAt: true },
      });
      return { email: member.email, expiresAt: created.expiresAt };
    });
    this.audit(actor, 'password_reset_created', id);
    this.deliver(tenantId, 'reset', reset.email, token);
    return { token, expiresAt: reset.expiresAt };
  }

  // ─── Públicos (quien recibió el enlace) ─────────────────────────────────────

  async previewInvitation(tenant: TenantContext, token: string): Promise<InvitationPreview> {
    const invitation = await this.findInvitation(this.prisma, tenant.tenantId, token);
    const brand = await this.prisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: { name: true },
    });
    return {
      email: invitation.email,
      role: invitation.role,
      brandName: brand?.name ?? tenant.slug,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(
    tenant: TenantContext,
    input: AcceptInvitationInput,
  ): Promise<StaffAuthResponse> {
    const { tenantId } = tenant;
    // argon2 fuera de la transacción: tarda y no tiene por qué tener el lock tomado.
    const passwordHash = await argon2.hash(input.password);
    let accepted;
    try {
      accepted = await this.prisma.$transaction(async (tx) => {
        await lock(tx, tenantId);
        const invitation = await this.findInvitation(tx, tenantId, input.token);
        const existing = await tx.staffMember.findFirst({
          where: { tenantId, email: invitation.email },
          select: { id: true },
        });
        if (existing) throw new ConflictException(ALREADY_MEMBER);
        // La invitación ya tenía su lugar reservado; se vuelve a mirar por si el plan bajó.
        await this.limits.assertCanAddStaff(tenantId, tx, invitation.id);
        const claimed = await tx.staffInvitation.updateMany({
          where: { tenantId, id: invitation.id, ...pending(new Date()) },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw new NotFoundException(INVALID_LINK);
        const staff = await tx.staffMember.create({
          data: {
            tenantId,
            email: invitation.email,
            name: input.name,
            role: invitation.role,
            passwordHash,
          },
          select: STAFF_SESSION_SELECT,
        });
        return { staff, invitationId: invitation.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(ALREADY_MEMBER);
      throw error;
    }
    const { staff } = accepted;
    return this.auth.staffSession(tenantId, staff);
  }

  async previewPasswordReset(tenant: TenantContext, token: string): Promise<PasswordResetPreview> {
    const reset = await this.findReset(this.prisma, tenant.tenantId, token);
    return { email: reset.staff.email, name: reset.staff.name, expiresAt: reset.expiresAt };
  }

  async confirmPasswordReset(
    tenant: TenantContext,
    input: ConfirmPasswordResetInput,
  ): Promise<StaffAuthResponse> {
    const { tenantId } = tenant;
    const passwordHash = await argon2.hash(input.password);
    const result = await this.prisma.$transaction(async (tx) => {
      const reset = await this.findReset(tx, tenantId, input.token);
      const now = new Date();
      const claimed = await tx.staffPasswordReset.updateMany({
        where: { tenantId, id: reset.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new NotFoundException(INVALID_LINK);
      // Contraseña nueva = sesiones anteriores fuera (por si la vieja estaba comprometida).
      await tx.staffMember.updateMany({
        where: { tenantId, id: reset.staffId, isActive: true },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      const updated = await tx.staffMember.findFirst({
        where: { tenantId, id: reset.staffId, isActive: true },
        select: STAFF_SESSION_SELECT,
      });
      if (!updated) throw new NotFoundException(INVALID_LINK);
      return { staff: updated, resetId: reset.id };
    });
    return this.auth.staffSession(tenantId, result.staff);
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  /** `actor`: quien actúa (el dueño, o quien usa su propio enlace al aceptar o confirmar). */
  private audit(
    actor: Pick<StaffPrincipal, 'tenantId' | 'staffId'>,
    action: string,
    targetId: string,
    changes?: Record<string, unknown>,
  ): void {
    this.logger.log(
      JSON.stringify({
        action,
        tenantId: actor.tenantId,
        actorId: actor.staffId,
        targetId,
        ...(changes ? { changes } : {}),
      }),
    );
  }

  private async findInvitation(
    db: PrismaDb,
    tenantId: string,
    token: string,
  ): Promise<TeamInvitation> {
    const invitation = await db.staffInvitation.findFirst({
      where: { tenantId, tokenHash: hashTeamToken(token), ...pending(new Date()) },
      select: INVITATION_SELECT,
    });
    if (!invitation) throw new NotFoundException(INVALID_LINK);
    return invitation;
  }

  private async findReset(db: PrismaDb, tenantId: string, token: string) {
    const reset = await db.staffPasswordReset.findFirst({
      where: {
        tenantId,
        tokenHash: hashTeamToken(token),
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        staff: { isActive: true, role: { not: 'owner' } },
      },
      select: {
        id: true,
        staffId: true,
        expiresAt: true,
        staff: { select: { email: true, name: true } },
      },
    });
    if (!reset) throw new NotFoundException(INVALID_LINK);
    return reset;
  }

  /**
   * Único punto de entrega de los enlaces. Hoy no hay correo: el panel muestra el enlace y el
   * dueño lo copia y lo comparte.
   *
   * TODO(TASK-021): con `MailService` en main, enviar acá el correo a `email` con
   * `https://<slug>.<TENANT_BASE_DOMAIN>` + `teamLinkPath(kind, token)` (@ventea/shared) en el
   * idioma de la marca, sin bloquear la respuesta y sin registrar el token en logs.
   */
  private deliver(_tenantId: string, _kind: TeamLinkKind, _email: string, _token: string): void {
    // Sin transporte de correo todavía (ver TODO).
  }
}

/** Invitación sin usar, sin revocar y vigente. */
function pending(now: Date) {
  return { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
}

async function lock(tx: PrismaDb, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team:${tenantId}`}))`;
}
