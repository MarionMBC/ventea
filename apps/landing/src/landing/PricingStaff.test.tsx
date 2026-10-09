import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockFetch, PLANS } from '@/test/fixtures';
import { renderEn, renderEs } from '@/test/render';

import { LandingPage } from './LandingPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Usuarios del panel por plan (TASK-022): lo que el panel aplica se publica en precios. */
describe('Precios: usuarios del panel por plan (dueño incluido)', () => {
  it('español: hasta 3, hasta 10 e ilimitados', async () => {
    mockFetch(() => json(PLANS));
    renderEs(<LandingPage />);
    await screen.findByTestId('price-basic');
    expect(
      within(screen.getByRole('listitem', { name: 'Básico' })).getByText(
        'Hasta 3 usuarios del panel (usted incluido)',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'Pro' })).getByText(
        'Hasta 10 usuarios del panel (usted incluido)',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'Cadena' })).getByText(
        'Usuarios del panel ilimitados',
      ),
    ).toBeTruthy();
  });

  it('inglés: up to 3, up to 10 and unlimited', async () => {
    mockFetch(() => json(PLANS));
    renderEn(<LandingPage />);
    await screen.findByTestId('price-basic');
    expect(
      within(screen.getByRole('listitem', { name: 'Basic' })).getByText(
        'Up to 3 dashboard users (you included)',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'Pro' })).getByText(
        'Up to 10 dashboard users (you included)',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('listitem', { name: 'Chain' })).getByText(
        'Unlimited dashboard users',
      ),
    ).toBeTruthy();
  });

  it('una API anterior sin maxStaff no publica nada (no promete ilimitados)', async () => {
    mockFetch(() => json(PLANS.map(({ maxStaff: _omit, ...plan }) => plan)));
    renderEs(<LandingPage />);
    await screen.findByTestId('price-basic');
    expect(screen.queryByText(/usuarios/i)).toBeNull();
  });
});
