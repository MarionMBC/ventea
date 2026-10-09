import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { selectProjectType } from '@/home/projectTypeEvent';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';

import { ContactForm } from './ContactForm';

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValid() {
  fill(/^nombre$/i, 'Ana');
  fill(/correo de trabajo/i, 'ana@acme.com');
  fill(/tipo de proyecto/i, 'apps');
  fill(/qué necesita/i, 'Una app Android e iOS para nuestros clientes.');
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /preparar correo/i }));

describe('ContactForm', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('campos con etiqueta; empresa marcada como opcional; honeypot fuera del árbol accesible', () => {
    render(<ContactForm t={es} openUrl={vi.fn()} />);
    expect(screen.getByLabelText(/^nombre$/i).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/empresa/i).tagName).toBe('INPUT');
    expect(screen.getByText('(opcional)')).toBeTruthy();
    expect(screen.getByLabelText(/correo de trabajo/i).getAttribute('type')).toBe('email');
    expect(screen.getByLabelText(/tipo de proyecto/i).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/qué necesita/i).tagName).toBe('TEXTAREA');
    const honeypot = document.getElementById('contact-website')!;
    expect(honeypot.getAttribute('tabindex')).toBe('-1');
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('errores accesibles: aria-invalid, aria-describedby, resumen y foco en el primer campo', () => {
    const openUrl = vi.fn();
    render(<ContactForm t={es} openUrl={openUrl} />);
    submit();
    expect(openUrl).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/^nombre$/i);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    const errorId = name.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toBe('Escriba su nombre.');
    expect(document.activeElement).toBe(name);
    expect(screen.getByRole('alert').textContent).toBe('Revise los campos marcados.');
    expect(screen.getByLabelText(/qué necesita/i).getAttribute('aria-describedby')).toContain(
      'contact-message-hint',
    );
    // Corregir un campo limpia su error.
    fill(/^nombre$/i, 'Ana');
    expect(screen.getByLabelText(/^nombre$/i).getAttribute('aria-invalid')).toBeNull();
  });

  it('correo inválido: mensaje propio y foco en el correo', () => {
    render(<ContactForm t={es} openUrl={vi.fn()} />);
    fillValid();
    fill(/correo de trabajo/i, 'ana@acme');
    submit();
    expect(screen.getByText(/escriba un correo válido/i)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/correo de trabajo/i));
  });

  it('válido: abre el mailto y muestra estados honestos, nunca «enviado»', () => {
    const openUrl = vi.fn();
    render(<ContactForm t={es} openUrl={openUrl} />);
    fillValid();
    submit();

    expect(openUrl).toHaveBeenCalledTimes(1);
    const url = String(openUrl.mock.calls[0]?.[0]);
    expect(url.startsWith('mailto:hola@ventea.tech?subject=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Proyecto de Aplicación web o móvil — Ana');
    expect(screen.getByRole('status').textContent).toBe('Abrimos su aplicación de correo…');

    act(() => vi.advanceTimersByTime(1000));
    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toMatch(/todavía no se envió/);
    expect(document.body.textContent).not.toMatch(/mensaje enviado|enviado con éxito|¡gracias/i);
    expect(
      screen.getByRole('link', { name: /escribir a hola@ventea\.tech/i }).getAttribute('href'),
    ).toBe('mailto:hola@ventea.tech');
    const preview = screen.getByLabelText(/texto del mensaje/i) as HTMLTextAreaElement;
    expect(preview.readOnly).toBe(true);
    expect(preview.value).toContain('Para: hola@ventea.tech');
  });

  it('copiar el mensaje: confirma solo si el portapapeles aceptó; si falla, lo dice', async () => {
    const copyText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'));
    render(<ContactForm t={es} openUrl={vi.fn()} copyText={copyText} />);
    fillValid();
    submit();
    act(() => vi.advanceTimersByTime(1000));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar el mensaje/i }));
    });
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('Asunto: Proyecto de'));
    expect(screen.getByText('Mensaje copiado.')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar el mensaje/i }));
    });
    expect(screen.getByText(/no se pudo copiar/i)).toBeTruthy();
  });

  it('honeypot lleno: no abre nada ni muestra estados', () => {
    const openUrl = vi.fn();
    render(<ContactForm t={es} openUrl={openUrl} />);
    fillValid();
    fireEvent.change(document.getElementById('contact-website')!, {
      target: { value: 'http://spam.test' },
    });
    submit();
    act(() => vi.advanceTimersByTime(1000));
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('el CTA de un servicio preselecciona el tipo de proyecto si está vacío', () => {
    render(<ContactForm t={es} openUrl={vi.fn()} />);
    const select = screen.getByLabelText(/tipo de proyecto/i) as HTMLSelectElement;
    act(() => selectProjectType('ai'));
    expect(select.value).toBe('ai');
    act(() => selectProjectType('saas'));
    expect(select.value).toBe('ai');
  });

  it('en inglés: textos y mailto en inglés; contador de caracteres', () => {
    const openUrl = vi.fn();
    render(<ContactForm t={en} openUrl={openUrl} />);
    expect(document.getElementById('contact-message-hint')?.textContent).toContain(
      'Up to 1000 characters (0/1000).',
    );
    fill(/^name$/i, 'Ana');
    fill(/work email/i, 'ana@acme.com');
    fill(/project type/i, 'architecture');
    fill(/what do you need/i, 'Review of our current architecture.');
    fireEvent.click(screen.getByRole('button', { name: /prepare email/i }));
    expect(decodeURIComponent(String(openUrl.mock.calls[0]?.[0]))).toContain(
      'Architecture and integrations project — Ana',
    );
    expect(screen.getByRole('status').textContent).toBe('Opening your email app…');
  });
});
