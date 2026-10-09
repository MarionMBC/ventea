import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockFetch, PLANS, text } from '@/test/fixtures';

import { LandingPage } from './LandingPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Landing (AC1)', () => {
  it('muestra los precios de la API, ordenados, con Pro destacado', async () => {
    const fetchMock = mockFetch(() => json(PLANS));
    render(<LandingPage />);

    expect(text(await screen.findByTestId('price-basic'))).toContain('$25 USD / mes');
    expect(text(screen.getByTestId('price-pro'))).toContain('$59 USD / mes');
    expect(text(screen.getByTestId('price-chain'))).toContain('$129 USD / mes');
    expect(fetchMock).toHaveBeenCalledWith('/api/platform/plans', expect.anything());

    const names = screen.getAllByRole('heading', { level: 3, name: /^(Básico|Pro|Cadena)$/ });
    expect(names.map((h) => h.textContent)).toEqual(['Básico', 'Pro', 'Cadena']);

    const pro = screen.getByRole('listitem', { name: 'Pro' });
    expect(within(pro).getByText('Recomendado')).toBeTruthy();
    expect(within(pro).getByText('App con su marca para Android y iOS')).toBeTruthy();
    expect(
      within(pro)
        .getByRole('link', { name: /Probar Pro gratis/ })
        .getAttribute('href'),
    ).toBe('/registro?plan=pro&intervalo=mensual');
  });

  it('el toggle anual cambia precios, nota de ahorro y link de registro', async () => {
    mockFetch(() => json(PLANS));
    render(<LandingPage />);
    await screen.findByTestId('price-pro');

    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }));

    expect((screen.getByRole('radio', { name: /Anual/ }) as HTMLInputElement).checked).toBe(true);
    expect(text(screen.getByTestId('price-pro'))).toContain('$590 USD / año');
    expect(text(screen.getByTestId('price-basic'))).toContain('$250 USD / año');
    const pro = screen.getByRole('listitem', { name: 'Pro' });
    expect(within(pro).getByText(/Equivale a \$49\.17 al mes · ahorra \$118/)).toBeTruthy();
    expect(
      within(pro)
        .getByRole('link', { name: /Probar Pro gratis/ })
        .getAttribute('href'),
    ).toBe('/registro?plan=pro&intervalo=anual');
  });

  it('si los precios no cargan avisa y permite reintentar', async () => {
    let fail = true;
    mockFetch(() => (fail ? json({ statusCode: 500, message: 'boom' }, 500) : json(PLANS)));
    render(<LandingPage />);

    expect(text(await screen.findByRole('alert'))).toContain('No pudimos cargar los precios');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('price-pro')).toBeTruthy();
  });

  it('tiene un solo h1 con el mensaje principal y no nombra marcas de terceros', async () => {
    mockFetch(() => json(PLANS));
    const { container } = render(<LandingPage />);
    await screen.findByTestId('price-pro');

    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(text(h1[0])).toBe('Su restaurante. Su propia app. Sus propios clientes.');
    expect(container.textContent).not.toMatch(/uber|pedidosya|rappi|glovo|didi|hugo/i);
  });

  it('no promete lo que el producto no hace: delivery, pago en línea ni cifras inventadas', async () => {
    mockFetch(() => json(PLANS));
    const { container } = render(<LandingPage />);
    await screen.findByTestId('price-pro');
    const all = text(container);

    // Hoy: para llevar o comer en el local, pago al retirar (orders.service.ts).
    expect(all).toContain('no hay delivery ni pago en línea dentro de Ventea');
    expect(all).not.toMatch(/entrega a domicilio|repartidores incluidos/i);
    // Sin comparaciones económicas ni porcentajes de comisión de terceros.
    expect(all).not.toMatch(/20\s*%|30\s*%|20–30/);
    // El tablero no es «tiempo real»: se actualiza cada pocos segundos.
    expect(all).not.toMatch(/tiempo real/i);
    // Ni testimonios ni conteos de clientes.
    expect(container.querySelector('blockquote')).toBeNull();
    expect(all).not.toMatch(/\d[\d.,]*\+?\s*(restaurantes|clientes|pedidos)\s+(usan|confían)/i);
  });

  it('los puntos del ejemplo salen de la configuración inicial real', async () => {
    mockFetch(() => json(PLANS));
    const { container } = render(<LandingPage />);
    await screen.findByTestId('price-pro');
    const loyalty = text(container.querySelector('#puntos'));
    expect(loyalty).toContain('1 punto por cada lempira del pedido');
    expect(loyalty).toContain('50 puntos al crear su cuenta');
    expect(loyalty).toContain('Desde 100 puntos; cada punto vale 1 centavo');
  });

  it('el pedido de ejemplo pasa por las columnas reales del tablero', async () => {
    mockFetch(() => json(PLANS));
    render(<LandingPage />);
    await screen.findByTestId('price-pro');
    const board = screen.getByRole('img', { name: /Tablero de pedidos del restaurante/ });
    expect(text(board)).toContain('Nuevos');
    expect(text(board)).toContain('En cocina');
    expect(text(board)).toContain('Listos');
  });
});
