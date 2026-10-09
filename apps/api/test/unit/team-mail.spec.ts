import { renderEmail, SECRET_LINK_KINDS } from '@/modules/mail/mail-templates';

/** Plantillas de enlaces del equipo (TASK-022): link solo al dominio y nombres neutralizados. */
const LINKS = { hosts: ['ventea.tech'] };
const EXPIRES = '2026-10-12T12:00:00.000Z';
const invite = (overrides: Record<string, unknown> = {}) => ({
  tenantName: 'Pollos Ana',
  inviterName: 'Ana',
  role: 'manager',
  inviteUrl: 'https://pollos.ventea.tech/admin/join#tok',
  expiresAt: EXPIRES,
  timeZone: 'America/Tegucigalpa',
  supportEmail: 'hola@ventea.tech',
  ...overrides,
});

describe('correos del equipo', () => {
  it('invitación ES/EN con el rol y el vencimiento', () => {
    const es = renderEmail('staff_invite', 'es', invite(), LINKS);
    expect(es.subject).toBe('Te invitaron a un panel de Ventea');
    expect(es.text).toContain('Ana te invitó al panel de Pollos Ana en Ventea como encargado');
    expect(es.text).toContain('12 de octubre de 2026');
    expect(es.html).toContain('href="https://pollos.ventea.tech/admin/join#tok"');
    const en = renderEmail('staff_invite', 'en', invite({ role: 'staff' }), LINKS);
    expect(en.subject).toBe("You're invited to a Ventea dashboard");
    expect(en.text).toContain('as staff');
  });

  it('link fuera del dominio de la plataforma: no se arma (anti-phishing)', () => {
    expect(() =>
      renderEmail(
        'staff_invite',
        'es',
        invite({ inviteUrl: 'https://evil.example/join#x' }),
        LINKS,
      ),
    ).toThrow(/link no permitido/);
    expect(() =>
      renderEmail(
        'staff_password_reset',
        'es',
        {
          tenantName: 'Pollos',
          memberName: 'Ana',
          resetUrl: 'javascript:alert(1)',
          expiresAt: EXPIRES,
          supportEmail: 'hola@ventea.tech',
        },
        LINKS,
      ),
    ).toThrow(/link no permitido/);
  });

  it('nombres de quien invita y del miembro sin links ni dominios', () => {
    const mail = renderEmail(
      'staff_invite',
      'es',
      invite({
        inviterName: 'Soporte www.evil.com https://evil.example/x',
        tenantName: 'evil.com.hn',
      }),
      LINKS,
    );
    for (const body of [mail.text, mail.html, mail.subject]) {
      expect(body).not.toMatch(/www\.evil|evil\.com|https:\/\/evil/);
    }
    expect(mail.html.match(/<a /g)).toHaveLength(1);
    const reset = renderEmail(
      'staff_password_reset',
      'en',
      {
        tenantName: 'Pollos',
        memberName: 'Ana evil.co',
        resetUrl: 'https://pollos.ventea.tech/admin/reset-password#tok',
        expiresAt: EXPIRES,
        supportEmail: 'hola@ventea.tech',
      },
      LINKS,
    );
    expect(reset.subject).toBe('New password for the Pollos dashboard');
    expect(reset.text).not.toContain('evil.co');
  });

  it('los dos tipos marcan su link como secreto (la outbox lo borra al enviarse)', () => {
    expect(SECRET_LINK_KINDS).toEqual({
      staff_invite: 'inviteUrl',
      staff_password_reset: 'resetUrl',
    });
  });
});
