import { describe, expect, it } from 'vitest';

import { buildMailto, EMPTY_CONTACT, validateContact, whatsappUrl } from './mailto';

const FILLED = {
  name: '  Ana López ',
  company: 'Acme & Co',
  email: 'ana@acme.com',
  projectType: 'SaaS platform',
  message: 'We need a multi-tenant billing module.\nDeadline: Q1.',
};

function query(url: string) {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
}

describe('buildMailto', () => {
  it('addresses the configured email with an encoded subject and body', () => {
    const url = buildMailto('hola@ventea.tech', FILLED);
    expect(url.startsWith('mailto:hola@ventea.tech?subject=')).toBe(true);
    expect(query(url).get('subject')).toBe('SaaS platform project — Ana López, Acme & Co');
    expect(query(url).get('body')).toBe(
      [
        'Name: Ana López',
        'Company: Acme & Co',
        'Email: ana@acme.com',
        'Project type: SaaS platform',
        '',
        'We need a multi-tenant billing module.\nDeadline: Q1.',
      ].join('\r\n'),
    );
  });

  it('encodes spaces as %20 (not +) and escapes & so the body is not cut', () => {
    const url = buildMailto('hola@ventea.tech', FILLED);
    expect(url).not.toContain('+');
    expect(url).toContain('Acme%20%26%20Co');
    expect(url.match(/&/g)).toHaveLength(1);
  });

  it('keeps the subject on one line even if a field carries CR/LF', () => {
    const url = buildMailto('hola@ventea.tech', {
      ...FILLED,
      name: 'Ana\r\nBcc: x@evil.test',
      company: 'Acme\nCo',
    });
    const subject = query(url).get('subject') ?? '';
    expect(subject).toBe('SaaS platform project — Ana Bcc: x@evil.test, Acme Co');
    expect(subject).not.toMatch(/[\r\n]/);
    expect(url.split('&body=')[0]).not.toMatch(/%0D|%0A/i);
  });

  it('omits the company from the subject when it is empty', () => {
    const url = buildMailto('hola@ventea.tech', { ...FILLED, company: '' });
    expect(query(url).get('subject')).toBe('SaaS platform project — Ana López');
    expect(query(url).get('body')).toContain('Company: —');
  });
});

describe('validateContact', () => {
  it('requires name, a valid email, project type and a short message', () => {
    expect(Object.keys(validateContact(EMPTY_CONTACT)).sort()).toEqual([
      'email',
      'message',
      'name',
      'projectType',
    ]);
    expect(validateContact({ ...FILLED, email: 'ana@acme' }).email).toMatch(/valid email/);
    expect(validateContact({ ...FILLED, message: 'hi' }).message).toBeDefined();
  });

  it('accepts a complete form; company is optional', () => {
    expect(validateContact({ ...FILLED, company: '' })).toEqual({});
  });
});

describe('whatsappUrl', () => {
  it('returns null without a number', () => {
    expect(whatsappUrl('', 'hi')).toBeNull();
    expect(whatsappUrl(' + ', 'hi')).toBeNull();
  });

  it('keeps only digits and encodes the text', () => {
    expect(whatsappUrl('+504 9999-8888', 'Hi there')).toBe(
      'https://wa.me/50499998888?text=Hi%20there',
    );
  });
});
