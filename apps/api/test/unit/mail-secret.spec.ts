import { randomBytes } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { openSecretLink, sealSecretLink, withoutSecretLink } from '@/modules/mail/mail-secret';
import { MailSettings } from '@/modules/mail/mail.settings';

const settings = (env: Record<string, string>) => new MailSettings(new ConfigService(env));

describe('links secretos en la outbox (TASK-022)', () => {
  const key = randomBytes(32);
  const payload = { tenantName: 'Pollos', inviteUrl: 'https://p.ventea.tech/admin/join#TOKEN' };

  it('cifra el link, lo abre con la misma fila y no con otra', () => {
    const sealed = sealSecretLink('staff_invite', payload, key, 'k1') as Record<string, string>;
    expect(sealed.inviteUrl!.startsWith('enc:')).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('TOKEN');
    expect(openSecretLink('staff_invite', sealed, key, 'k1')).toEqual(payload);
    expect(() => openSecretLink('staff_invite', sealed, key, 'k2')).toThrow();
    expect(() => openSecretLink('staff_invite', sealed, randomBytes(32), 'k1')).toThrow();
    expect(() => openSecretLink('staff_invite', payload, key, 'k1')).toThrow(/ausente/);
  });

  it('otros tipos pasan tal cual; el estado final borra el link', () => {
    expect(sealSecretLink('welcome', payload, key, 'k')).toBe(payload);
    expect(withoutSecretLink({ kind: 'staff_invite', payload })).toEqual({
      payload: { ...payload, inviteUrl: '[redacted]' },
    });
    expect(withoutSecretLink({ kind: 'welcome', payload })).toEqual({});
  });
});

describe('MailSettings: links por modo de tenant', () => {
  it('multi: <slug>.<dominio> y app.<dominio>', () => {
    const s = settings({ TENANT_MODE: 'multi', TENANT_BASE_DOMAIN: 'ventea.tech' });
    expect(s.tenantUrl('pollos', '/admin')).toBe('https://pollos.ventea.tech/admin');
    expect(s.platformUrl('/apps')).toBe('https://app.ventea.tech/admin/plataforma/apps');
    expect(s.links.hosts).toEqual(['ventea.tech']);
  });

  it('single: TODOS los links a PUBLIC_ORIGIN, único host permitido', () => {
    const s = settings({
      TENANT_MODE: 'single',
      TENANT_BASE_DOMAIN: '',
      PUBLIC_ORIGIN: 'https://pedidos.carolinahotchicken.cl',
    });
    expect(s.tenantUrl('carolina-hot-chicken', '/admin/join#t')).toBe(
      'https://pedidos.carolinahotchicken.cl/admin/join#t',
    );
    expect(s.tenantUrl('x')).toBe('https://pedidos.carolinahotchicken.cl');
    expect(s.platformUrl('/apps')).toBe(
      'https://pedidos.carolinahotchicken.cl/admin/plataforma/apps',
    );
    expect(s.links.hosts).toEqual(['pedidos.carolinahotchicken.cl']);
    expect(s.linksAvailable).toBe(true);
  });

  it('single sin PUBLIC_ORIGIN: no hay link posible (no se encola)', () => {
    const s = settings({ TENANT_MODE: 'single' });
    expect(s.linksAvailable).toBe(false);
    expect(() => s.tenantUrl('x')).toThrow(/PUBLIC_ORIGIN/);
  });

  it('clave de links secretos derivada de PUSH_CREDENTIALS_KEY (distinta a ella)', () => {
    const push = randomBytes(32);
    const s = settings({ TENANT_MODE: 'multi', PUSH_CREDENTIALS_KEY: push.toString('hex') });
    expect(s.secretLinkKey).toHaveLength(32);
    expect(s.secretLinkKey!.equals(push)).toBe(false);
    expect(settings({ TENANT_MODE: 'multi' }).secretLinkKey).toBeNull();
  });
});
