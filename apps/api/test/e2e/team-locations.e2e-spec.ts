import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type {
  CreatedInvitation,
  Location,
  StaffAuthResponse,
  StaffLocation,
  StaffLocations,
  Team,
  TeamLink,
} from '@ventea/shared';
import request from 'supertest';

import { hashTeamToken } from '@/modules/team/team-tokens';

import {
  createApp,
  createRawPrisma,
  createStaffMember,
  loginStaff,
  loginStaffAs,
  registerCustomer,
  seedTenant,
  STAFF_PASSWORD,
  type TestTenant,
} from './helpers';

describe('Panel: sucursales y equipo (TASK-022)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenant: TestTenant;
  let other: TestTenant;
  let owner: string;
  let manager: string;
  let staff: string;
  let otherOwner: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string, slug = tenant.slug) => ({
    get: (url: string) =>
      http().get(url).set('X-Tenant-Slug', slug).set('Authorization', `Bearer ${token}`),
    post: (url: string, body?: object) =>
      http()
        .post(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    patch: (url: string, body: object) =>
      http()
        .patch(url)
        .set('X-Tenant-Slug', slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (url: string) =>
      http().delete(url).set('X-Tenant-Slug', slug).set('Authorization', `Bearer ${token}`),
  });
  const anon = (slug = tenant.slug) => ({
    post: (url: string, body: object) => http().post(url).set('X-Tenant-Slug', slug).send(body),
  });

  async function setPlan(tenantId: string, code: 'basic' | 'pro' | 'chain'): Promise<void> {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code } });
    await prisma.subscription.update({ where: { tenantId }, data: { planId: plan.id } });
  }

  const invite = (email: string, role: 'manager' | 'staff' = 'staff') =>
    as(owner).post('/api/staff/team/invitations', { email, role });

  beforeAll(async () => {
    app = await createApp();
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'team');
    other = await seedTenant(prisma, 'team-other');
    owner = (await loginStaff(app, tenant)).accessToken;
    manager = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'manager'));
    staff = await loginStaffAs(app, tenant, await createStaffMember(prisma, tenant, 'staff'));
    otherOwner = (await loginStaff(app, other)).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  // ─── Sucursales ─────────────────────────────────────────────────────────────

  describe('sucursales', () => {
    it('cualquier staff lee todas (también las inactivas) con el cupo del plan', async () => {
      const body = (await as(staff).get('/api/staff/locations').expect(200)).body as StaffLocations;
      expect(body.locations.map((l) => l.id).sort()).toEqual(
        [tenant.locationId, tenant.inactiveLocationId].sort(),
      );
      expect(body.usage).toMatchObject({ used: 1, max: null, plan: 'chain' });
      expect(body.locations[0]).toMatchObject({ acceptsOrders: true, hasOrders: false });
    });

    it('staff no escribe (403); sin sesión 401', async () => {
      await as(staff).post('/api/staff/locations', { name: 'X', address: 'Y' }).expect(403);
      await as(staff).patch(`/api/staff/locations/${tenant.locationId}`, { name: 'X' }).expect(403);
      await as(staff).delete(`/api/staff/locations/${tenant.inactiveLocationId}`).expect(403);
      await http().get('/api/staff/locations').set('X-Tenant-Slug', tenant.slug).expect(401);
    });

    it('el manager crea una sucursal con horario y la app la ve en GET /api/locations', async () => {
      const created = (
        await as(manager)
          .post('/api/staff/locations', {
            name: 'Sucursal Norte',
            address: 'Av. Norte 45',
            phone: '+504 2222-3333',
            openingHours: [
              { day: 5, opens: '18:00', closes: '02:00' },
              { day: 1, opens: '11:00', closes: '22:00' },
            ],
          })
          .expect(201)
      ).body as StaffLocation;
      expect(created).toMatchObject({
        isActive: true,
        acceptsOrders: true,
        phone: '+504 2222-3333',
      });
      expect(created.openingHours.map((r) => r.day)).toEqual([1, 5]);

      const publicList = (
        await http().get('/api/locations').set('X-Tenant-Slug', tenant.slug).expect(200)
      ).body as Location[];
      const norte = publicList.find((l) => l.id === created.id);
      expect(norte).toMatchObject({ name: 'Sucursal Norte', acceptsOrders: true });
      // Las inactivas no llegan a la app.
      expect(publicList.some((l) => l.id === tenant.inactiveLocationId)).toBe(false);
    });

    it('valida el cuerpo (400): horario inválido, campos de más, PATCH vacío', async () => {
      await as(owner)
        .post('/api/staff/locations', {
          name: 'Mala',
          address: 'Calle',
          openingHours: [{ day: 1, opens: '25:00', closes: '10:00' }],
        })
        .expect(400);
      await as(owner)
        .post('/api/staff/locations', { name: 'Mala', address: 'Calle', tenantId: other.id })
        .expect(400);
      await as(owner).patch(`/api/staff/locations/${tenant.locationId}`, {}).expect(400);
    });

    it('sin pedidos: la sucursal activa sale del menú de la app pero sigue listada', async () => {
      const location = (
        await as(owner)
          .post('/api/staff/locations', { name: 'Solo vitrina', address: 'Calle 9' })
          .expect(201)
      ).body as StaffLocation;
      await as(owner)
        .patch(`/api/staff/locations/${location.id}`, { acceptsOrders: false })
        .expect(200);

      const publicList = (
        await http().get('/api/locations').set('X-Tenant-Slug', tenant.slug).expect(200)
      ).body as Location[];
      expect(publicList.find((l) => l.id === location.id)?.acceptsOrders).toBe(false);

      const customer = await registerCustomer(app, tenant.slug);
      const response = await http()
        .post('/api/orders')
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          locationId: location.id,
          fulfillmentType: 'pickup',
          lines: [{ menuItemId: randomUUID(), quantity: 1 }],
        })
        .expect(400);
      expect((response.body as { message: string }).message).toMatch(/no está recibiendo pedidos/);
    });

    it('aislamiento: otra marca no ve, no edita ni borra mis sucursales (404)', async () => {
      const list = (await as(otherOwner, other.slug).get('/api/staff/locations').expect(200))
        .body as StaffLocations;
      expect(list.locations.some((l) => l.id === tenant.locationId)).toBe(false);
      await as(otherOwner, other.slug)
        .patch(`/api/staff/locations/${tenant.locationId}`, { name: 'Robada' })
        .expect(404);
      await as(otherOwner, other.slug)
        .delete(`/api/staff/locations/${tenant.inactiveLocationId}`)
        .expect(404);
      // Token de otra marca contra mi slug: 401.
      await as(otherOwner).get('/api/staff/locations').expect(401);
    });

    it('límite del plan Básico (1 activa): alta y reactivación → 403 plan_limit', async () => {
      const basic = await seedTenant(prisma, 'team-basic');
      await setPlan(basic.id, 'basic');
      const token = (await loginStaff(app, basic)).accessToken;

      const response = await as(token, basic.slug)
        .post('/api/staff/locations', { name: 'Segunda', address: 'Calle 2' })
        .expect(403);
      expect(response.body).toMatchObject({
        code: 'plan_limit',
        limit: { resource: 'locations', plan: 'basic', max: 1 },
      });
      await as(token, basic.slug)
        .patch(`/api/staff/locations/${basic.inactiveLocationId}`, { isActive: true })
        .expect(403);
      // Inactiva sí se puede crear (no ocupa cupo).
      await as(token, basic.slug)
        .post('/api/staff/locations', { name: 'Borrador', address: 'Calle 3', isActive: false })
        .expect(201);
      const list = (await as(token, basic.slug).get('/api/staff/locations').expect(200))
        .body as StaffLocations;
      expect(list.usage).toMatchObject({ used: 1, max: 1, plan: 'basic', planName: 'Básico' });
    });

    it('no deja la marca sin sucursal activa (409)', async () => {
      const solo = await seedTenant(prisma, 'team-solo');
      const token = (await loginStaff(app, solo)).accessToken;
      await as(token, solo.slug)
        .patch(`/api/staff/locations/${solo.locationId}`, { isActive: false })
        .expect(409);
      await as(token, solo.slug).delete(`/api/staff/locations/${solo.locationId}`).expect(409);
    });

    it('borra sin pedidos (204); con pedidos 409 (se desactiva)', async () => {
      await as(owner).delete(`/api/staff/locations/${tenant.inactiveLocationId}`).expect(204);
      await as(owner).delete(`/api/staff/locations/${tenant.inactiveLocationId}`).expect(404);

      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          locationId: tenant.locationId,
          code: `T${randomUUID().slice(0, 5)}`,
          fulfillmentType: 'pickup',
        },
      });
      const list = (await as(owner).get('/api/staff/locations').expect(200)).body as StaffLocations;
      expect(list.locations.find((l) => l.id === tenant.locationId)?.hasOrders).toBe(true);
      await as(owner).delete(`/api/staff/locations/${tenant.locationId}`).expect(409);
    });
  });

  // ─── Equipo ─────────────────────────────────────────────────────────────────

  describe('equipo', () => {
    it('solo el dueño: manager y staff 403', async () => {
      await as(manager).get('/api/staff/team').expect(403);
      await as(staff).get('/api/staff/team').expect(403);
      await as(manager)
        .post('/api/staff/team/invitations', { email: 'x@y.z', role: 'staff' })
        .expect(403);
    });

    it('lista miembros con isSelf y el cupo; nunca el hash de la contraseña', async () => {
      const response = await as(owner).get('/api/staff/team').expect(200);
      const team = response.body as Team;
      expect(team.members).toHaveLength(3);
      expect(team.members.find((m) => m.isSelf)?.role).toBe('owner');
      expect(team.usage).toMatchObject({ used: 3, max: null });
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('invitar → aceptar → entra con su rol; el token es de un solo uso y se guarda con hash', async () => {
      const email = `nuevo-${randomUUID().slice(0, 6)}@example.com`;
      const created = (await invite(email.toUpperCase(), 'manager').expect(201))
        .body as CreatedInvitation;
      expect(created.invitation).toMatchObject({ email, role: 'manager' });
      const hours = (new Date(created.expiresAt).getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(71.9);
      expect(hours).toBeLessThanOrEqual(72);

      const row = await prisma.staffInvitation.findUniqueOrThrow({
        where: { id: created.invitation.id },
      });
      expect(row.tokenHash).toBe(hashTeamToken(created.token));
      expect(row.tokenHash).not.toContain(created.token);

      // El dueño ve la invitación pendiente (sin token).
      const team = (await as(owner).get('/api/staff/team').expect(200)).body as Team;
      expect(team.invitations.map((i) => i.email)).toContain(email);
      expect(JSON.stringify(team)).not.toContain(created.token);

      const preview = await anon()
        .post('/api/staff/auth/invitation/lookup', { token: created.token })
        .expect(200);
      expect(preview.body).toMatchObject({ email, role: 'manager', brandName: 'Tenant team' });

      const accepted = (
        await anon()
          .post('/api/staff/auth/invitation/accept', {
            token: created.token,
            name: 'Nueva Gerente',
            password: 'clave-nueva-123',
          })
          .expect(200)
      ).body as StaffAuthResponse;
      expect(accepted.staff).toMatchObject({ email, role: 'manager', name: 'Nueva Gerente' });

      // Su sesión abre lo que su rol permite y nada más.
      await as(accepted.accessToken)
        .post('/api/staff/locations', { name: 'M', address: 'A', isActive: false })
        .expect(201);
      await as(accepted.accessToken).get('/api/staff/team').expect(403);

      // Login normal con la contraseña elegida.
      await anon()
        .post('/api/staff/auth/login', { email, password: 'clave-nueva-123' })
        .expect(200);

      // Segundo uso del mismo enlace: el mismo 404 que un enlace inventado.
      await anon()
        .post('/api/staff/auth/invitation/accept', {
          token: created.token,
          name: 'Otra',
          password: 'clave-nueva-123',
        })
        .expect(404);
      await anon().post('/api/staff/auth/invitation/lookup', { token: created.token }).expect(404);
    });

    it('enlace inválido, vencido, revocado o de otra marca → 404', async () => {
      const email = `vence-${randomUUID().slice(0, 6)}@example.com`;
      const created = (await invite(email).expect(201)).body as CreatedInvitation;

      // De otra marca: el token no existe allá.
      await anon(other.slug)
        .post('/api/staff/auth/invitation/lookup', { token: created.token })
        .expect(404);

      // Vencido.
      await prisma.staffInvitation.update({
        where: { id: created.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await anon().post('/api/staff/auth/invitation/lookup', { token: created.token }).expect(404);

      // Revocado.
      const again = (await invite(email).expect(201)).body as CreatedInvitation;
      await as(owner).delete(`/api/staff/team/invitations/${again.invitation.id}`).expect(204);
      await anon().post('/api/staff/auth/invitation/lookup', { token: again.token }).expect(404);
      await as(owner).delete(`/api/staff/team/invitations/${again.invitation.id}`).expect(404);

      // Formato inválido: 400 (no llega a la base).
      await anon().post('/api/staff/auth/invitation/lookup', { token: 'corto' }).expect(400);
      await anon()
        .post('/api/staff/auth/invitation/lookup', { token: 'a'.repeat(43) })
        .expect(404);
    });

    it('reinvitar al mismo email revoca el enlace anterior', async () => {
      const email = `dos-${randomUUID().slice(0, 6)}@example.com`;
      const first = (await invite(email).expect(201)).body as CreatedInvitation;
      const second = (await invite(email).expect(201)).body as CreatedInvitation;
      await anon().post('/api/staff/auth/invitation/lookup', { token: first.token }).expect(404);
      await anon().post('/api/staff/auth/invitation/lookup', { token: second.token }).expect(200);
      const team = (await as(owner).get('/api/staff/team').expect(200)).body as Team;
      expect(team.invitations.filter((i) => i.email === email)).toHaveLength(1);
    });

    it('invitar a alguien que ya es del equipo → 409', async () => {
      await invite(tenant.staffEmail).expect(409);
    });

    it('rol de dueño no se regala (400)', async () => {
      await as(owner)
        .post('/api/staff/team/invitations', { email: 'jefe@example.com', role: 'owner' })
        .expect(400);
    });

    it('cambiar rol y desactivar cortan la sesión del miembro en el acto', async () => {
      const email = await createStaffMember(prisma, tenant, 'staff');
      const login = (
        await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(200)
      ).body as StaffAuthResponse;
      await as(login.accessToken).get('/api/staff/locations').expect(200);

      await as(owner)
        .patch(`/api/staff/team/members/${login.staff.id}`, { role: 'manager' })
        .expect(204);
      await as(login.accessToken).get('/api/staff/locations').expect(401);
      await anon().post('/api/auth/refresh', { refreshToken: login.refreshToken }).expect(401);

      // Nueva sesión con el rol nuevo.
      const relogin = (
        await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(200)
      ).body as StaffAuthResponse;
      expect(relogin.staff.role).toBe('manager');

      await as(owner)
        .patch(`/api/staff/team/members/${login.staff.id}`, { isActive: false })
        .expect(204);
      await as(relogin.accessToken).get('/api/staff/locations').expect(401);
      await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(401);

      // Reactivar devuelve el acceso.
      await as(owner)
        .patch(`/api/staff/team/members/${login.staff.id}`, { isActive: true })
        .expect(204);
      await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(200);
    });

    it('el dueño no se quita a sí mismo ni deja la marca sin dueño (409)', async () => {
      const me = (await loginStaff(app, tenant)).staff;
      await as(owner).patch(`/api/staff/team/members/${me.id}`, { role: 'manager' }).expect(409);
      await as(owner).patch(`/api/staff/team/members/${me.id}`, { isActive: false }).expect(409);
      await as(owner).post(`/api/staff/team/members/${me.id}/password-reset`).expect(409);
    });

    it('un segundo dueño sí puede pasar a manager (queda uno activo)', async () => {
      const email = await createStaffMember(prisma, tenant, 'owner');
      const member = await prisma.staffMember.findFirstOrThrow({
        where: { tenantId: tenant.id, email },
      });
      await as(owner)
        .patch(`/api/staff/team/members/${member.id}`, { role: 'manager' })
        .expect(204);
    });

    it('aislamiento: no toco miembros ni invitaciones de otra marca (404)', async () => {
      const otherMember = await prisma.staffMember.findFirstOrThrow({
        where: { tenantId: other.id },
      });
      await as(owner)
        .patch(`/api/staff/team/members/${otherMember.id}`, { isActive: false })
        .expect(404);
      await as(owner).post(`/api/staff/team/members/${otherMember.id}/password-reset`).expect(404);
      const theirs = (
        await as(otherOwner, other.slug)
          .post('/api/staff/team/invitations', { email: 'ajeno@example.com', role: 'staff' })
          .expect(201)
      ).body as CreatedInvitation;
      await as(owner).delete(`/api/staff/team/invitations/${theirs.invitation.id}`).expect(404);
      const mine = (await as(owner).get('/api/staff/team').expect(200)).body as Team;
      expect(mine.members.some((m) => m.id === otherMember.id)).toBe(false);
      expect(mine.invitations.some((i) => i.id === theirs.invitation.id)).toBe(false);
    });

    it('reset de contraseña: enlace de un solo uso, corta sesiones y deja entrar con la nueva', async () => {
      const email = await createStaffMember(prisma, tenant, 'staff');
      const before = (
        await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(200)
      ).body as StaffAuthResponse;

      const link = (
        await as(owner)
          .post(`/api/staff/team/members/${before.staff.id}/password-reset`)
          .expect(201)
      ).body as TeamLink;
      const stored = await prisma.staffPasswordReset.findFirstOrThrow({
        where: { tenantId: tenant.id, staffId: before.staff.id },
      });
      expect(stored.tokenHash).toBe(hashTeamToken(link.token));

      const preview = await anon()
        .post('/api/staff/auth/password-reset/lookup', { token: link.token })
        .expect(200);
      expect(preview.body).toMatchObject({ email });

      // Un enlace nuevo invalida el anterior.
      const newer = (
        await as(owner)
          .post(`/api/staff/team/members/${before.staff.id}/password-reset`)
          .expect(201)
      ).body as TeamLink;
      await anon()
        .post('/api/staff/auth/password-reset/confirm', {
          token: link.token,
          password: 'otra-clave-123',
        })
        .expect(404);

      const after = (
        await anon()
          .post('/api/staff/auth/password-reset/confirm', {
            token: newer.token,
            password: 'otra-clave-123',
          })
          .expect(200)
      ).body as StaffAuthResponse;
      expect(after.staff.email).toBe(email);

      await as(before.accessToken).get('/api/staff/locations').expect(401);
      await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(401);
      await anon().post('/api/staff/auth/login', { email, password: 'otra-clave-123' }).expect(200);
      await anon()
        .post('/api/staff/auth/password-reset/confirm', {
          token: newer.token,
          password: 'tercera-123',
        })
        .expect(404);
    });

    it('desactivar revoca el enlace de contraseña pendiente', async () => {
      const email = await createStaffMember(prisma, tenant, 'staff');
      const member = await prisma.staffMember.findFirstOrThrow({
        where: { tenantId: tenant.id, email },
      });
      const link = (
        await as(owner).post(`/api/staff/team/members/${member.id}/password-reset`).expect(201)
      ).body as TeamLink;
      await as(owner)
        .patch(`/api/staff/team/members/${member.id}`, { isActive: false })
        .expect(204);
      await anon().post('/api/staff/auth/password-reset/lookup', { token: link.token }).expect(404);
      await as(owner).post(`/api/staff/team/members/${member.id}/password-reset`).expect(409);
    });

    it('límite del plan Básico (3 usuarios): invitaciones pendientes cuentan → 403 plan_limit', async () => {
      const basic = await seedTenant(prisma, 'team-limit');
      await setPlan(basic.id, 'basic');
      const token = (await loginStaff(app, basic)).accessToken;
      const inviteBasic = (email: string) =>
        as(token, basic.slug).post('/api/staff/team/invitations', { email, role: 'staff' });

      await inviteBasic('uno@example.com').expect(201);
      const two = (await inviteBasic('dos@example.com').expect(201)).body as CreatedInvitation;
      const blocked = await inviteBasic('tres@example.com').expect(403);
      expect(blocked.body).toMatchObject({
        code: 'plan_limit',
        limit: { resource: 'staff', plan: 'basic', max: 3 },
      });
      // Reinvitar a alguien ya invitado no ocupa otro lugar.
      await inviteBasic('dos@example.com').expect(201);

      const team = (await as(token, basic.slug).get('/api/staff/team').expect(200)).body as Team;
      expect(team.usage).toMatchObject({ used: 3, max: 3 });

      // Revocar libera el lugar.
      const current = team.invitations.find((i) => i.email === 'dos@example.com');
      expect(current?.id).not.toBe(two.invitation.id);
      await as(token, basic.slug).delete(`/api/staff/team/invitations/${current?.id}`).expect(204);
      await inviteBasic('tres@example.com').expect(201);

      // Reactivar un miembro con el cupo lleno: 403.
      const inactive = await prisma.staffMember.create({
        data: {
          tenantId: basic.id,
          email: 'viejo@example.com',
          name: 'Viejo',
          role: 'staff',
          isActive: false,
          passwordHash: 'x',
        },
      });
      await as(token, basic.slug)
        .patch(`/api/staff/team/members/${inactive.id}`, { isActive: true })
        .expect(403);
    });

    it('aceptar con el plan ya lleno (bajó de plan) → 403 y la invitación sigue pendiente', async () => {
      const shrink = await seedTenant(prisma, 'team-shrink');
      const token = (await loginStaff(app, shrink)).accessToken;
      const created = (
        await as(token, shrink.slug)
          .post('/api/staff/team/invitations', { email: 'tarde@example.com', role: 'staff' })
          .expect(201)
      ).body as CreatedInvitation;
      await createStaffMember(prisma, shrink, 'staff');
      await createStaffMember(prisma, shrink, 'staff');
      await setPlan(shrink.id, 'basic');
      await anon(shrink.slug)
        .post('/api/staff/auth/invitation/accept', {
          token: created.token,
          name: 'Tarde',
          password: 'clave-larga-123',
        })
        .expect(403);
      await anon(shrink.slug)
        .post('/api/staff/auth/invitation/lookup', { token: created.token })
        .expect(200);
    });
  });
  describe('equipo: dueños y auditoría (review TASK-022)', () => {
    async function coOwner() {
      const email = await createStaffMember(prisma, tenant, 'owner');
      const login = (
        await anon().post('/api/staff/auth/login', { email, password: STAFF_PASSWORD }).expect(200)
      ).body as StaffAuthResponse;
      return login;
    }

    it('no hay enlace de contraseña para otro dueño (409)', async () => {
      const other = await coOwner();
      await as(owner).post(`/api/staff/team/members/${other.staff.id}/password-reset`).expect(409);
    });

    it('el listado dice quién creó cada invitación', async () => {
      const email = `audit-${randomUUID().slice(0, 6)}@example.com`;
      await invite(email).expect(201);
      const team = (await as(owner).get('/api/staff/team').expect(200)).body as Team;
      expect(team.invitations.find((i) => i.email === email)?.invitedByName).toBe('Dueño');
    });

    it('si el dueño que creó un enlace de contraseña se desactiva o pierde el rol, el enlace muere', async () => {
      for (const change of [{ isActive: false }, { role: 'manager' }] as const) {
        const coowner = await coOwner();
        const email = await createStaffMember(prisma, tenant, 'manager');
        const target = await prisma.staffMember.findFirstOrThrow({
          where: { tenantId: tenant.id, email },
        });
        const link = (
          await as(coowner.accessToken)
            .post(`/api/staff/team/members/${target.id}/password-reset`)
            .expect(201)
        ).body as TeamLink;
        await as(owner).patch(`/api/staff/team/members/${coowner.staff.id}`, change).expect(204);
        await anon()
          .post('/api/staff/auth/password-reset/lookup', { token: link.token })
          .expect(404);
        await anon()
          .post('/api/staff/auth/password-reset/confirm', {
            token: link.token,
            password: 'tomada-123456',
          })
          .expect(404);
      }
    });

    it('si el dueño que invitó pierde el rol o se desactiva, sus invitaciones dejan de servir', async () => {
      const demoted = await coOwner();
      const first = (
        await as(demoted.accessToken)
          .post('/api/staff/team/invitations', {
            email: `de-${randomUUID().slice(0, 6)}@example.com`,
            role: 'staff',
          })
          .expect(201)
      ).body as CreatedInvitation;
      await as(owner)
        .patch(`/api/staff/team/members/${demoted.staff.id}`, { role: 'manager' })
        .expect(204);
      await anon().post('/api/staff/auth/invitation/lookup', { token: first.token }).expect(404);

      const deactivated = await coOwner();
      const second = (
        await as(deactivated.accessToken)
          .post('/api/staff/team/invitations', {
            email: `dd-${randomUUID().slice(0, 6)}@example.com`,
            role: 'staff',
          })
          .expect(201)
      ).body as CreatedInvitation;
      await as(owner)
        .patch(`/api/staff/team/members/${deactivated.staff.id}`, { isActive: false })
        .expect(204);
      await anon().post('/api/staff/auth/invitation/lookup', { token: second.token }).expect(404);

      // Las del dueño que sigue activo no se tocan.
      const mine = (await invite(`sigue-${randomUUID().slice(0, 6)}@example.com`).expect(201))
        .body as CreatedInvitation;
      await anon().post('/api/staff/auth/invitation/lookup', { token: mine.token }).expect(200);
    });
  });
});
