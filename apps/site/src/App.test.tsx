import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';
import { config } from './config';
import { FAQ, SERVICES } from './content';
import { Contact } from './home/HomePage';

function section(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`falta la sección #${id}`);
  return element;
}

describe('home page', () => {
  it('renders the hero with both CTAs', () => {
    render(<App path="/" />);
    expect(
      screen.getByRole('heading', { level: 1, name: /design and build software/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /talk about your project/i }).getAttribute('href'),
    ).toBe('#contact');
    expect(screen.getByRole('link', { name: /see services/i }).getAttribute('href')).toBe(
      '#services',
    );
  });

  it('renders every key section with its heading', () => {
    render(<App path="/" />);
    for (const id of ['services', 'process', 'product', 'stack', 'why', 'faq', 'contact']) {
      expect(within(section(id)).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    }
  });

  it('lists the six services and the FAQ', () => {
    render(<App path="/" />);
    expect(SERVICES).toHaveLength(6);
    for (const service of SERVICES) {
      expect(
        within(section('services')).getByRole('heading', { name: service.title }),
      ).toBeTruthy();
    }
    expect(document.querySelectorAll('.faq__item')).toHaveLength(FAQ.length);
  });

  it('links the only real case, Ventea for restaurants, to app.ventea.tech', () => {
    render(<App path="/" />);
    const link = within(section('product')).getByRole('link', {
      name: /visit ventea for restaurants/i,
    });
    expect(link.getAttribute('href')).toBe('https://app.ventea.tech');
  });

  it('does not show invented social proof', () => {
    render(<App path="/" />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\+\s?\d+|\d+\+|testimonial|our clients|trusted by|award|certified/i);
  });

  it('footer links to the product, the email and the privacy notice', () => {
    render(<App path="/" />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /ventea for restaurants/i })).toBeTruthy();
    expect(
      within(footer).getByRole('link', { name: config.contactEmail }).getAttribute('href'),
    ).toBe(`mailto:${config.contactEmail}`);
    expect(
      within(footer)
        .getByRole('link', { name: /privacy/i })
        .getAttribute('href'),
    ).toBe('/privacy');
  });
});

describe('WhatsApp link', () => {
  it('is hidden when config.whatsapp is empty (the shipped config)', () => {
    expect(config.whatsapp).toBe('');
    render(<App path="/" />);
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
    expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
  });

  it('shows when a number is configured', () => {
    render(<Contact whatsapp="50499998888" />);
    expect(screen.getByRole('link', { name: /whatsapp/i }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/50499998888\?text=/,
    );
  });
});

describe('other routes', () => {
  it('/privacy renders the site privacy notice', () => {
    render(<App path="/privacy" />);
    expect(screen.getByRole('heading', { level: 1, name: /privacy notice/i })).toBeTruthy();
    expect(document.body.textContent).toMatch(/does not set cookies/);
  });

  it('unknown paths render the 404 page', () => {
    render(<App path="/nope" />);
    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeTruthy();
  });
});
