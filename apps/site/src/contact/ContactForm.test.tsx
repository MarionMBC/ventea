import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContactForm } from './ContactForm';

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ContactForm', () => {
  it('has labelled fields; company is marked optional', () => {
    render(<ContactForm openUrl={vi.fn()} />);
    expect(screen.getByLabelText(/^name$/i).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/company/i).tagName).toBe('INPUT');
    expect(screen.getByText('(optional)')).toBeTruthy();
    expect(screen.getByLabelText(/work email/i).getAttribute('type')).toBe('email');
    expect(screen.getByLabelText(/project type/i).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/what do you need/i).tagName).toBe('TEXTAREA');
  });

  it('shows accessible errors, focuses the first invalid field and opens nothing', () => {
    const openUrl = vi.fn();
    render(<ContactForm openUrl={openUrl} />);
    fireEvent.click(screen.getByRole('button', { name: /open email/i }));

    expect(openUrl).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/^name$/i);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    const errorId = name.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toMatch(/your name/);
    expect(document.activeElement).toBe(name);
    expect(screen.getByLabelText(/what do you need/i).getAttribute('aria-describedby')).toContain(
      'contact-message-hint',
    );
  });

  it('opens a mailto with the filled fields to the configured address', () => {
    const openUrl = vi.fn();
    render(<ContactForm openUrl={openUrl} />);
    fill(/^name$/i, 'Ana');
    fill(/work email/i, 'ana@acme.com');
    fill(/project type/i, 'Mobile app');
    fill(/what do you need/i, 'An Android and iOS app for our customers.');
    fireEvent.click(screen.getByRole('button', { name: /open email/i }));

    expect(openUrl).toHaveBeenCalledTimes(1);
    const url = String(openUrl.mock.calls[0]?.[0]);
    expect(url.startsWith('mailto:hola@ventea.tech?subject=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Mobile app project — Ana');
    expect(decodeURIComponent(url)).toContain('An Android and iOS app for our customers.');
    expect(screen.getByRole('status').textContent).toMatch(/hola@ventea\.tech/);
  });
});
