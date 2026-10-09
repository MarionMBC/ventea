import { describe, expect, it } from 'vitest';

import { en } from '@/i18n/en';
import { es } from '@/i18n/es';

import {
  buildMailto,
  buildMessage,
  EMPTY_CONTACT,
  isSpam,
  plainText,
  validateContact,
  type ContactFields,
} from './mailto';

const FILLED: ContactFields = {
  name: '  Ana López ',
  company: 'Acme & Co',
  email: 'ana@acme.com',
  projectType: 'saas',
  message: 'Necesitamos un módulo de cobro multiempresa.\nFecha: Q1.',
};

function query(url: string) {
  return new URLSearchParams(url.slice(url.indexOf('?') + 1));
}

describe('buildMessage + buildMailto', () => {
  it('arma asunto y cuerpo en español con la etiqueta del tipo de proyecto', () => {
    const url = buildMailto('hola@ventea.tech', buildMessage(FILLED, es.contact));
    expect(url.startsWith('mailto:hola@ventea.tech?subject=')).toBe(true);
    expect(query(url).get('subject')).toBe(
      'Proyecto de Producto o plataforma SaaS — Ana López, Acme & Co',
    );
    expect(query(url).get('body')).toBe(
      [
        'Nombre: Ana López',
        'Empresa: Acme & Co',
        'Correo: ana@acme.com',
        'Tipo de proyecto: Producto o plataforma SaaS',
        '',
        'Necesitamos un módulo de cobro multiempresa.',
        'Fecha: Q1.',
      ].join('\r\n'),
    );
  });

  it('en inglés usa las etiquetas en inglés', () => {
    const mail = buildMessage(FILLED, en.contact);
    expect(mail.subject).toBe('SaaS product or platform project — Ana López, Acme & Co');
    expect(mail.body).toContain('Project type: SaaS product or platform');
  });

  it('codifica espacios como %20 (no +) y escapa & para no cortar el cuerpo', () => {
    const url = buildMailto('hola@ventea.tech', buildMessage(FILLED, es.contact));
    expect(url).not.toContain('+');
    expect(url).toContain('Acme%20%26%20Co');
    expect(url.match(/&/g)).toHaveLength(1);
    expect(url).not.toMatch(/[\r\n]/);
  });

  it('el asunto queda en una sola línea aunque un campo traiga CR/LF (sin inyectar cabeceras)', () => {
    const mail = buildMessage(
      { ...FILLED, name: 'Ana\r\nBcc: x@evil.test', company: 'Acme\nCo', email: 'a@b.co\r\nCc: y' },
      es.contact,
    );
    expect(mail.subject).toBe(
      'Proyecto de Producto o plataforma SaaS — Ana Bcc: x@evil.test, Acme Co',
    );
    expect(mail.subject).not.toMatch(/[\r\n]/);
    const url = buildMailto('hola@ventea.tech', mail);
    expect(url.split('&body=')[0]).not.toMatch(/%0D|%0A/i);
    // En el cuerpo, las líneas de cabecera tampoco se parten.
    expect(mail.body.split('\r\n')[0]).toBe('Nombre: Ana Bcc: x@evil.test');
    expect(mail.body.split('\r\n')[2]).toBe('Correo: a@b.co Cc: y');
  });

  it('sin empresa: no va en el asunto y el cuerpo lleva «—»', () => {
    const mail = buildMessage({ ...FILLED, company: '' }, es.contact);
    expect(mail.subject).toBe('Proyecto de Producto o plataforma SaaS — Ana López');
    expect(mail.body).toContain('Empresa: —');
  });

  it('texto para copiar con destinatario y asunto', () => {
    const text = plainText('hola@ventea.tech', buildMessage(FILLED, es.contact), es.contact);
    expect(text.startsWith('Para: hola@ventea.tech\nAsunto: Proyecto de')).toBe(true);
    expect(text).not.toContain('\r');
  });
});

describe('validateContact', () => {
  it('pide nombre, correo válido, tipo de proyecto y un mensaje mínimo', () => {
    expect(validateContact(EMPTY_CONTACT)).toEqual({
      name: 'name',
      email: 'email',
      projectType: 'projectType',
      message: 'message',
    });
    expect(validateContact({ ...FILLED, email: 'ana@acme' }).email).toBe('emailInvalid');
    expect(validateContact({ ...FILLED, message: '  hola   ' }).message).toBe('message');
  });

  it('acepta un formulario completo; la empresa es opcional', () => {
    expect(validateContact({ ...FILLED, company: '' })).toEqual({});
  });
});

describe('honeypot', () => {
  it('cualquier contenido es spam; vacío o espacios no', () => {
    expect(isSpam('')).toBe(false);
    expect(isSpam('   ')).toBe(false);
    expect(isSpam('http://spam.test')).toBe(true);
  });
});
