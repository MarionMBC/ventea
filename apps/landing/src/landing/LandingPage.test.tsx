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
    expect(within(pro).getByText('App con tu marca para Android y iOS')).toBeTruthy();
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
    expect(within(pro).getByText(/Equivale a \$49\.17 al mes · ahorras \$118/)).toBeTruthy();
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

  it('la calculadora compara comisiones de 20–30% con el precio fijo de Pro', async () => {
    mockFetch(() => json(PLANS));
    render(<LandingPage />);
    await screen.findByTestId('price-pro');

    fireEvent.change(screen.getByLabelText(/Lo que vendes al mes/), { target: { value: '5000' } });
    expect(screen.getByText('$1,000 – $1,500')).toBeTruthy();
    expect(text(screen.getByText('Ventea Pro, precio fijo').nextSibling)).toContain('$59');
  });

  it('tiene un solo h1 con el mensaje principal y no nombra marcas de terceros', async () => {
    mockFetch(() => json(PLANS));
    const { container } = render(<LandingPage />);
    await screen.findByTestId('price-pro');

    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(text(h1[0])).toContain(
      'Tu restaurante con app propia, pedidos y puntos — sin comisiones',
    );
    expect(container.textContent).not.toMatch(/uber|pedidosya|rappi|glovo|didi|hugo/i);
  });
});
