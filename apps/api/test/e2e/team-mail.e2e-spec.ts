import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { CreatedInvitation, TeamLink } from '@ventea/shared';
import request from 'supertest';

import { FakeMailTransport } from '@/modules/mail/fake.transport';
import { MailService } from '@/modules/mail/mail.service';

import { createApp, createRawPrisma, loginStaff, seedTenant, type TestTenant } from './helpers';

/** Enlaces del equipo por correo (TASK-022 + TASK-021), con transporte falso. */
describe('Equipo: invitación y contraseña nueva por correo', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let mail: MailService;
  let tenant: TestTenant;
  let owner: string;
  const fake = new FakeMailTransport();

  const as = (token: string) => ({
    post: (url: string, body?: object) =>
      request(app.getHttpServer())
        .post(url)
        .set('X-Tenant-Slug', tenant.slug)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
  });
  const invite = async (email: string, role: 'manager' | 'staff' = 'staff') => {
    const response = await as(owner)
      .post('/api/staff/team/invitations', { email, role })
      .expect(201);
    await mail.drain();
    return response.body as CreatedInvitation;
  };
  const outbox = (kind: string) =>
    prisma.emailMessage.findMany({
      where: { tenantId: tenant.id, kind },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    app = await createApp({ mail: fake });
    mail = app.get(MailService);
    prisma = createRawPrisma();
    tenant = await seedTenant(prisma, 'team-mail');
    owner = (await loginStaff(app, tenant)).accessToken;
    // Otras suites dejan correos en cola: no salen por este transporte.
    await prisma.emailMessage.updateMany({
      where: { status: 'pending' },
      data: { status: 'skipped' },
    });
  });

  beforeEach(() => fake.reset());

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('invitación: correo al invitado con el link al dominio de la marca, en el idioma de la marca', async () => {
    const email = `inv-${randomUUID().slice(0, 6)}@example.com`;
    const created = await invite(email, 'manager');
    // El panel sigue recibiendo el link para copiar.
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(fake.sent).toHaveLength(1);
    const sent = fake.sent[0]!;
    expect(sent.to).toBe(email);
    expect(sent.subject).toBe(`Te invitaron al panel de Tenant team-mail`);
    const link = `https://${tenant.slug}.ventea.tech/admin/join#${created.token}`;
    expect(sent.text).toContain(link);
    expect(sent.text).toContain('como encargado');
    expect(sent.html).toContain(`href="${link}"`);

    // Enviado: la outbox ya no guarda el token.
    const [row] = await outbox('staff_invite');
    expect(row).toMatchObject({ status: 'sent', to: email, language: 'es' });
    expect(row!.dedupeKey).toBe(`staff_invite:${tenant.id}:${created.invitation.id}`);
    expect(JSON.stringify(row!.payload)).not.toContain(created.token);
    expect((row!.payload as Record<string, unknown>).inviteUrl).toBe('[redacted]');
  });

  it('marca en inglés: correo en inglés; nombres con links van neutralizados', async () => {
    await prisma.tenantBranding.update({
      where: { tenantId: tenant.id },
      data: { language: 'en' },
    });
    await prisma.tenant.update({ where: { id: tenant.id }, data: { name: 'Pollo www.evil.com' } });
    try {
      const created = await invite(`en-${randomUUID().slice(0, 6)}@example.com`);
      const sent = fake.sent[0]!;
      expect(sent.subject).toMatch(/^You're invited to the .* dashboard$/);
      expect(sent.text).toContain('as staff');
      expect(sent.text).not.toContain('www.evil.com');
      expect(sent.subject).not.toContain('evil.com');
      expect(sent.text).toContain(`#${created.token}`);
    } finally {
      await prisma.tenantBranding.update({
        where: { tenantId: tenant.id },
        data: { language: 'es' },
      });
      await prisma.tenant.update({ where: { id: tenant.id }, data: { name: 'Tenant team-mail' } });
    }
  });

  it('contraseña nueva: correo al miembro con su link y su nombre neutralizado', async () => {
    const member = await prisma.staffMember.create({
      data: {
        tenantId: tenant.id,
        email: `m-${randomUUID().slice(0, 6)}@example.com`,
        name: 'Ana https://phish.example',
        role: 'staff',
        passwordHash: 'x',
      },
    });
    const response = await as(owner)
      .post(`/api/staff/team/members/${member.id}/password-reset`)
      .expect(201);
    await mail.drain();
    const link = response.body as TeamLink;
    expect(fake.sent).toHaveLength(1);
    const sent = fake.sent[0]!;
    expect(sent.to).toBe(member.email);
    expect(sent.subject).toBe('Contraseña nueva para el panel de Tenant team-mail');
    expect(sent.text).toContain(
      `https://${tenant.slug}.ventea.tech/admin/reset-password#${link.token}`,
    );
    expect(sent.text).not.toContain('https://phish');
    const rows = await outbox('staff_password_reset');
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain(link.token);
  });

  it('sin SMTP: el correo queda skipped, sin token guardado, y el panel tiene el link', async () => {
    fake.configured = false;
    const created = await invite(`skip-${randomUUID().slice(0, 6)}@example.com`);
    expect(fake.sent).toHaveLength(0);
    const rows = await outbox('staff_invite');
    const row = rows.find((r) => r.dedupeKey.endsWith(created.invitation.id));
    expect(row?.status).toBe('skipped');
    expect(JSON.stringify(row?.payload)).not.toContain(created.token);
    expect(created.token).toHaveLength(43);
  });
});
