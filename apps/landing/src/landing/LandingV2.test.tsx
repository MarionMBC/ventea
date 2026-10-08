import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTACT_EMAIL, DEMO_URL } from '@/config';
import { beaconEvents, json, mockFetch, PLANS, text } from '@/test/fixtures';
import { WhatsAppButton } from '@/site/WhatsAppButton';

import { buildDemoMailto, DemoRequest } from './DemoRequest';
import { LandingPage } from './LandingPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLanding() {
  mockFetch(() => json(PLANS));
  const view = render(<LandingPage />);
  await screen.findByTestId('price-pro');
  return view;
}

describe('Demo con capturas reales (TASK-007 AC2)', () => {
  it('tres capturas AVIF+WebP con dimensiones, lazy y texto alternativo', async () => {
    await renderLanding();
    const section = screen.getByRole('region', { name: 'Mírala funcionando' });
    const images = within(section).getAllByRole('img');
    expect(images).toHaveLength(3);
    for (const img of images) {
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('alt')!.length).toBeGreaterThan(20);
      expect(img.getAttribute('src')).toMatch(/\.webp/);
      const source = img.parentElement!.querySelector('source');
      expect(source?.getAttribute('type')).toBe('image/avif');
    }
  });

  it('link a la demo en vivo y mención neutral de Carolina, sin testimonios ni cifras', async () => {
    const { container } = await renderLanding();
    const live = screen.getByRole('link', { name: /Ver una demo en vivo/ });
    expect(live.getAttribute('href')).toBe(DEMO_URL);
    expect(live.getAttribute('rel')).toContain('noopener');
    expect(text(container)).toContain('Carolina Hot Chicken ya recibe pedidos con Ventea');
    expect(container.querySelector('blockquote')).toBeNull();
    expect(text(container)).not.toMatch(
      /\d[\d.,]*\s*(restaurantes|clientes|pedidos)\s+(usan|confían)/i,
    );
  });
});

describe('FAQ alineada con los términos (review TASK-007)', () => {
  it('no promete avisos proactivos; el pago se coordina y la prueba se ve en Facturación', async () => {
    const { container } = await renderLanding();
    const faq = text(container.querySelector('#preguntas'));
    expect(faq).not.toMatch(/te avisamos/i);
    expect(faq).toContain('en la sección Facturación de tu panel ves hasta cuándo dura tu prueba');
    expect(faq).toContain('coordinamos el pago contigo');
  });
});

describe('Contacto (TASK-007)', () => {
  it('sin número configurado no hay botón de WhatsApp', async () => {
    await renderLanding();
    expect(screen.queryByRole('link', { name: 'Escríbenos por WhatsApp' })).toBeNull();
  });

  it('con número, botón flotante a wa.me con mensaje', () => {
    render(<WhatsAppButton phone="+504 9999-8888" />);
    const link = screen.getByRole('link', { name: 'Escríbenos por WhatsApp' });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/50499998888\?text=/);
  });

  it('«Pedir una demo» valida y abre un mailto con asunto y cuerpo prellenados', () => {
    const navigate = vi.fn();
    render(<DemoRequest navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir una demo' }));
    expect(screen.getByText('Escribe tu nombre.')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Nombre del restaurante'), {
      target: { value: 'Pollos Doña Ana' },
    });
    fireEvent.change(screen.getByLabelText(/Teléfono o WhatsApp/), {
      target: { value: '+504 9999-8888' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir una demo' }));

    const url = String(navigate.mock.calls[0]![0]);
    expect(url.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toBe('Quiero una demo de Ventea: Pollos Doña Ana');
    expect(params.get('body')).toContain('Teléfono o WhatsApp: +504 9999-8888');
    expect(params.get('body')).not.toContain('Ciudad');
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('buildDemoMailto codifica caracteres especiales', () => {
    const url = buildDemoMailto({
      name: 'José & Co',
      restaurant: 'Tacos #1',
      city: '',
      phone: '',
      message: 'Hola?',
    });
    expect(url).not.toMatch(/[ #&](?![^?]*=)/);
    expect(decodeURIComponent(url)).toContain('Tacos #1');
  });
});

describe('Embudo sin cookies (TASK-007 AC4)', () => {
  it('una visita por pestaña y un clic por cada CTA al registro', async () => {
    const first = await renderLanding();
    expect(await beaconEvents()).toEqual(['visit']);
    expect(document.cookie).toBe('');

    // Otra vista en la misma pestaña no cuenta otra visita.
    first.unmount();
    render(<LandingPage />);
    fireEvent.click(screen.getAllByRole('link', { name: /Prueba 14 días gratis/ })[0]!);
    expect(await beaconEvents()).toEqual(['visit', 'cta_click']);

    const [url, body] = (window.navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>).mock
      .calls[1]!;
    expect(url).toBe('/api/platform/analytics/event');
    expect((body as Blob).type).toBe('application/json');
  });

  it('el footer enlaza las páginas legales', async () => {
    await renderLanding();
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    expect(within(legal).getByRole('link', { name: 'Términos del servicio' })).toBeTruthy();
    expect(within(legal).getByRole('link', { name: 'Política de privacidad' })).toBeTruthy();
  });
});
