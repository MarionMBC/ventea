import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTACT_EMAIL, DEMO_URL } from '@/config';
import { beaconEvents, json, mockFetch, PLANS, text } from '@/test/fixtures';
import { PanelAccess } from '@/site/PanelAccess';
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

describe('Capturas reales del producto (TASK-007 AC2, TASK-010)', () => {
  it('panel y app de Carolina: AVIF+WebP con dimensiones, lazy y texto alternativo', async () => {
    const { container } = await renderLanding();
    const shots = [...container.querySelectorAll<HTMLImageElement>('#panel img, #identidad img')];
    expect(shots).toHaveLength(3);
    for (const img of shots) {
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0);
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('alt')!.length).toBeGreaterThan(20);
      expect(img.getAttribute('src')).toMatch(/\.webp/);
      const source = img.parentElement!.querySelector('source');
      expect(source?.getAttribute('type')).toBe('image/avif');
    }
  });

  it('mención neutral de Carolina y el restaurante de ejemplo presentado como tal', async () => {
    const { container } = await renderLanding();
    expect(text(container)).toContain('Carolina Hot Chicken ya recibe pedidos con Ventea');
    expect(text(container)).toContain('Demostración con un restaurante de ejemplo');
    // El menú web de las marcas todavía no está publicado: no se enlaza una «demo en vivo».
    expect(container.querySelector(`a[href="${DEMO_URL}"]`)).toBeNull();
  });

  it('las fotos de platillos son decorativas o con alt, con srcset y tamaño fijo', async () => {
    const { container } = await renderLanding();
    const photos = [...container.querySelectorAll<HTMLImageElement>('img[srcset]')];
    expect(photos.length).toBeGreaterThan(4);
    for (const img of photos) {
      expect(img.getAttribute('width')).toBe('320');
      expect(img.getAttribute('height')).toBe('320');
      expect(img.getAttribute('alt')).not.toBeNull();
    }
  });
});

describe('FAQ alineada con los términos (review TASK-007)', () => {
  it('no promete avisos proactivos; el pago se coordina y la prueba se ve en Facturación', async () => {
    const { container } = await renderLanding();
    const faq = text(container.querySelector('#preguntas'));
    expect(faq).not.toMatch(/te avisamos/i);
    expect(faq).toContain('en la sección Facturación de su panel ve hasta cuándo dura su prueba');
    expect(faq).toContain('coordinamos el pago con usted');
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
    expect(screen.getByText('Escriba su nombre.')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Su nombre'), { target: { value: 'Ana' } });
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
    fireEvent.click(screen.getAllByRole('link', { name: /Registrar mi restaurante/ })[0]!);
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

describe('Acceso al panel (TASK-010)', () => {
  it('arma la dirección del panel de la marca y valida el formato', async () => {
    const navigate = vi.fn();
    render(<PanelAccess navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Entrar a mi panel'), {
      target: { value: 'https://Casa-Brasa.ventea.tech/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }));
    expect(navigate).toHaveBeenCalledWith('https://casa-brasa.ventea.tech/admin');
  });
});
