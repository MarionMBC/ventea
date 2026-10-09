import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { StaffMenu } from '@ventea/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { apiError, createFakeApi, STAFF_SESSION, type Handler } from '@/test/fixtures';
import { CAT_SANDWICHES, GROUP_SPICE, makeMenu, menuHandler } from '@/test/menu-fixtures';

function renderMenu({
  role = 'owner',
  menu = makeMenu(),
  before,
}: {
  role?: 'owner' | 'manager' | 'staff';
  menu?: StaffMenu;
  /** Intercepta antes del menú falso (errores, demoras). */
  before?: Handler;
} = {}) {
  const state = { menu };
  const api = createFakeApi();
  const handle = menuHandler(state);
  api.setOverride(async (req) => (await before?.(req)) ?? handle(req));
  const session = createSessionStore(null);
  session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', '/admin/menu');
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, state };
}

const calls = (api: ReturnType<typeof createFakeApi>, method: string, path: RegExp) =>
  api.calls.filter((c) => c.method === method && path.test(c.path));

afterEach(() => {
  document.title = '';
});

describe('Menú: lectura', () => {
  it('muestra categorías, productos, precios en la moneda y el precio anterior', async () => {
    renderMenu();
    expect(await screen.findByRole('heading', { level: 2, name: 'Sandwiches' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Menu' })).toBeTruthy();
    expect(screen.getByText('3 products in 2 categories')).toBeTruthy();
    expect(screen.getByText('$12.90')).toBeTruthy();
    expect(screen.getByText('$16.50')).toBeTruthy();
    expect(screen.getByText('1 modifier group')).toBeTruthy();
    expect(document.title).toBe('Menu · Ventea');
  });

  it('el staff solo lee: sin botones de edición, con aviso', async () => {
    renderMenu({ role: 'staff' });
    await screen.findByText('Reaper Sandwich');
    expect(screen.getByText(/Only the owner and managers can change it/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New product' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(screen.getAllByText('Available').length).toBe(3);
  });

  it('búsqueda por nombre o etiqueta, sin tildes; sin resultados ofrece limpiar', async () => {
    renderMenu();
    await screen.findByText('Reaper Sandwich');
    const search = screen.getByRole('searchbox', { name: 'Search products' });
    fireEvent.change(search, { target: { value: 'HOT' } });
    expect(screen.getByText('Reaper Sandwich')).toBeTruthy();
    expect(screen.queryByText('Fries')).toBeNull();
    // Buscando, no se puede reordenar.
    expect(screen.queryByRole('button', { name: 'Move Reaper Sandwich up' })).toBeNull();
    fireEvent.change(search, { target: { value: 'pizza' } });
    expect(screen.getByText('No products match “pizza”')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Fries')).toBeTruthy();
  });

  it('menú vacío: invita a crear la primera categoría', async () => {
    renderMenu({ menu: { currency: 'USD', categories: [], modifierGroups: [] } });
    expect(await screen.findByText('Your menu is empty')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New product' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'New category' }).length).toBe(2);
  });

  it('error al cargar: mensaje traducido y reintentar', async () => {
    let fail = true;
    renderMenu({
      before: (req) =>
        fail && req.path === '/api/staff/menu' ? apiError(500, 'Error interno') : undefined,
    });
    expect(await screen.findByText('We couldn’t load the menu')).toBeTruthy();
    expect(screen.getByText(/The server didn’t respond correctly \(500\)/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Reaper Sandwich')).toBeTruthy();
  });
});

describe('Menú: edición', () => {
  it('crea una categoría desde el diálogo', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('button', { name: 'New category' }));
    const dialog = screen.getByRole('dialog', { name: 'New category' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Give the category a name.');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' Drinks ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Drinks' })).toBeTruthy();
    expect(calls(api, 'POST', /categories$/)[0]!.body).toEqual({ name: 'Drinks', isActive: true });
    expect(screen.getByText('Category “Drinks” saved.')).toBeTruthy();
  });

  it('crea un producto con foto, precio en la moneda y modificadores', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('button', { name: 'Add product to Sandwiches' }));
    const drawer = screen.getByRole('dialog', { name: 'New product' });
    expect(document.activeElement).toBe(within(drawer).getByLabelText('Name'));

    // Validación propia antes de llamar a la API.
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(within(drawer).getByText('Give the product a name.')).toBeTruthy();
    expect(within(drawer).getByText('Enter a valid price, for example 12.50.')).toBeTruthy();

    fireEvent.change(within(drawer).getByLabelText('Name'), { target: { value: 'Nashville Hot' } });
    fireEvent.change(within(drawer).getByLabelText('Price (USD)'), { target: { value: '12,5' } });
    fireEvent.change(within(drawer).getByLabelText(/Tags/), {
      target: { value: 'Hot, new, hot' },
    });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', {
      type: 'image/png',
    });
    const input = drawer.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await within(drawer).findByRole('button', { name: 'Replace' })).toBeTruthy();
    expect(within(drawer).getByRole('img', { name: 'Photo preview' }).getAttribute('src')).toBe(
      'http://localhost/api/media/t/new.webp',
    );
    fireEvent.click(within(drawer).getByRole('checkbox', { name: /Spice level/ }));

    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('“Nashville Hot” saved.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls(api, 'POST', /\/staff\/media$/)).toHaveLength(1);
    expect(calls(api, 'POST', /\/staff\/menu\/items$/)[0]!.body).toEqual({
      categoryId: CAT_SANDWICHES,
      name: 'Nashville Hot',
      description: null,
      basePriceCents: 1250,
      compareAtPriceCents: null,
      tags: ['hot', 'new'],
      isAvailable: true,
      imageUrl: 'http://localhost/api/media/t/new.webp',
      modifierGroupIds: [GROUP_SPICE],
    });
    expect(await screen.findByText('Nashville Hot')).toBeTruthy();
  });

  it('una imagen de tipo o tamaño inválido se rechaza traducida, sin subir', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('button', { name: 'New product' }));
    const drawer = screen.getByRole('dialog', { name: 'New product' });
    const input = drawer.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'doc.gif', { type: 'image/gif' })] },
    });
    expect(within(drawer).getByRole('alert').textContent).toMatch(/Use PNG, JPG or WebP/);
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [big] } });
    expect(within(drawer).getByRole('alert').textContent).toBe(
      'The image is larger than 5 MB. Choose a smaller one.',
    );
    expect(calls(api, 'POST', /\/staff\/media$/)).toHaveLength(0);
  });

  it.each([
    [
      413,
      'The image is too large: up to 5 MB and 24 megapixels. Choose a smaller one or resize it.',
    ],
    [503, 'The server is busy processing images. Try again in a few seconds.'],
  ])('la API rechaza la subida con %i: mensaje traducido', async (status, message) => {
    renderMenu({
      before: (req) =>
        req.path === '/api/staff/media' ? apiError(status, 'Mensaje de la API') : undefined,
    });
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('button', { name: 'New product' }));
    const drawer = screen.getByRole('dialog', { name: 'New product' });
    const input = drawer.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    });
    expect((await within(drawer).findByRole('alert')).textContent).toBe(message);
    expect(within(drawer).getByRole('button', { name: 'Choose image' })).toBeTruthy();
  });

  it('editar manda solo lo que cambió (la foto heredada no se reenvía)', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reaper Sandwich' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit product' });
    expect((within(drawer).getByLabelText('Price (USD)') as HTMLInputElement).value).toBe('12.90');
    fireEvent.change(within(drawer).getByLabelText('Price (USD)'), { target: { value: '13' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await screen.findByText('“Reaper Sandwich” saved.');
    expect(calls(api, 'PATCH', /\/staff\/menu\/items\/[^/]+$/)[0]!.body).toEqual({
      basePriceCents: 1300,
    });
  });

  it('el precio anterior tiene que ser mayor que el precio', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Classic Sandwich' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit product' });
    fireEvent.change(within(drawer).getByLabelText(/Previous price/), { target: { value: '5' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(
      within(drawer).getByText('The previous price must be higher than the price.'),
    ).toBeTruthy();
    expect(calls(api, 'PATCH', /items/)).toHaveLength(0);
  });

  it('Escape cierra el editor y devuelve el foco', async () => {
    renderMenu();
    await screen.findByText('Reaper Sandwich');
    const opener = screen.getByRole('button', { name: 'Edit Reaper Sandwich' });
    opener.focus();
    fireEvent.click(opener);
    const drawer = screen.getByRole('dialog', { name: 'Edit product' });
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('agotado: cambia al instante y vuelve atrás si la API falla', async () => {
    let release: (response: Response) => void = () => {};
    const { api } = renderMenu({
      before: (req) =>
        req.path.endsWith('/availability')
          ? new Promise<Response>((resolve) => (release = resolve))
          : undefined,
    });
    await screen.findByText('Reaper Sandwich');
    const toggle = screen.getByRole('switch', { name: 'Reaper Sandwich available' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    // Optimista: antes de que responda la API.
    await waitFor(() =>
      expect(
        screen
          .getByRole('switch', { name: 'Reaper Sandwich available' })
          .getAttribute('aria-checked'),
      ).toBe('false'),
    );
    expect(calls(api, 'PATCH', /availability$/)[0]!.body).toEqual({ isAvailable: false });
    await act(async () => release(apiError(500, 'Error interno')));
    await waitFor(() =>
      expect(
        screen
          .getByRole('switch', { name: 'Reaper Sandwich available' })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    );
    expect(screen.getByRole('alert').textContent).toMatch(/didn’t respond correctly \(500\)/);
  });

  it('agotado que la API acepta queda guardado', async () => {
    const { state } = renderMenu();
    await screen.findByText('Fries');
    fireEvent.click(screen.getByRole('switch', { name: 'Fries available' }));
    await waitFor(() => expect(state.menu.categories[1]!.items[0]!.isAvailable).toBe(false));
    expect(screen.getByText('Fries marked as sold out.')).toBeTruthy();
  });

  it('reordenar con los botones (alternativa al arrastre) y anunciarlo', async () => {
    const { api, state } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    expect(
      (screen.getByRole('button', { name: 'Move Reaper Sandwich up' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move Reaper Sandwich down' }));
    await waitFor(() =>
      expect(state.menu.categories[0]!.items.map((i) => i.name)).toEqual([
        'Classic Sandwich',
        'Reaper Sandwich',
      ]),
    );
    const body = calls(api, 'PATCH', /items\/reorder$/)[0]!.body as {
      items: { sortOrder: number }[];
    };
    expect(body.items.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(screen.getByText('Reaper Sandwich moved to position 2 of 2.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move Sides up' }));
    await waitFor(() =>
      expect(state.menu.categories.map((c) => c.name)).toEqual(['Sides', 'Sandwiches']),
    );
  });

  it('reordenar arrastrando un producto sobre otro', async () => {
    const { state } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    const row = (name: string) => screen.getByText(name).closest('li')!;
    const dataTransfer = { setData: () => {}, effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(row('Classic Sandwich'), { dataTransfer });
    fireEvent.dragOver(row('Reaper Sandwich'), { dataTransfer });
    fireEvent.drop(row('Reaper Sandwich'), { dataTransfer });
    await waitFor(() =>
      expect(state.menu.categories[0]!.items.map((i) => i.name)).toEqual([
        'Classic Sandwich',
        'Reaper Sandwich',
      ]),
    );
  });

  it('borrar pide confirmación; cancelar no borra', async () => {
    const { api } = renderMenu();
    await screen.findByText('Fries');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Fries' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete “Fries”?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls(api, 'DELETE', /items/)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Fries' }));
    dialog = screen.getByRole('dialog', { name: 'Delete “Fries”?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('“Fries” deleted.')).toBeTruthy();
    expect(calls(api, 'DELETE', /items/)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('Fries')).toBeNull());
  });

  it('borrar una categoría con productos: avisa y muestra el 409 de la API', async () => {
    renderMenu();
    await screen.findByText('Fries');
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Sides' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Sides”?' });
    expect(within(dialog).getByText(/It still has 1 product/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Delete “Sides”?' })).toBeTruthy();
  });

  it('grupos de modificadores: lista y alta con opciones (precio negativo permitido)', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('tab', { name: /Modifier groups/ }));
    expect(screen.getByText('Spice level')).toBeTruthy();
    expect(screen.getByText(/Choose 1 · used by 1 product/)).toBeTruthy();
    expect(screen.getByText('+$1.50')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New group' }));
    const drawer = screen.getByRole('dialog', { name: 'New modifier group' });
    fireEvent.change(within(drawer).getByLabelText('Name'), { target: { value: 'Extras' } });
    fireEvent.change(within(drawer).getByLabelText('Option 1 name'), {
      target: { value: 'No slaw' },
    });
    fireEvent.change(within(drawer).getByLabelText('Option 1 extra price'), {
      target: { value: '-0.50' },
    });
    fireEvent.change(within(drawer).getByLabelText('Minimum to choose'), {
      target: { value: '2' },
    });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(within(drawer).getByRole('alert').textContent).toBe(
      'The minimum can’t be higher than the maximum.',
    );
    fireEvent.change(within(drawer).getByLabelText('Minimum to choose'), {
      target: { value: '0' },
    });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Add option' }));
    fireEvent.change(within(drawer).getByLabelText('Option 2 name'), {
      target: { value: 'Pickles' },
    });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Move option 2 up' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Group “Extras” saved.')).toBeTruthy();
    expect(calls(api, 'POST', /modifier-groups$/)[0]!.body).toEqual({
      name: 'Extras',
      minSelect: 0,
      maxSelect: 1,
      options: [
        { name: 'Pickles', priceDeltaCents: 0, isAvailable: true },
        { name: 'No slaw', priceDeltaCents: -50, isAvailable: true },
      ],
    });
  });

  it('editar un grupo aplica la diferencia de opciones', async () => {
    const { api } = renderMenu();
    await screen.findByText('Reaper Sandwich');
    fireEvent.click(screen.getByRole('tab', { name: /Modifier groups/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit group Spice level' }));
    const drawer = screen.getByRole('dialog', { name: 'Edit modifier group' });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Remove option 1' }));
    fireEvent.change(within(drawer).getByLabelText('Option 1 extra price'), {
      target: { value: '2' },
    });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Add option' }));
    fireEvent.change(within(drawer).getByLabelText('Option 2 name'), {
      target: { value: 'Ghost' },
    });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await screen.findByText('Group “Spice level” saved.');
    expect(calls(api, 'DELETE', /modifier-options/)).toHaveLength(1);
    expect(calls(api, 'PATCH', /modifier-options/)[0]!.body).toEqual({ priceDeltaCents: 200 });
    expect(calls(api, 'POST', /options$/)[0]!.body).toEqual({
      name: 'Ghost',
      priceDeltaCents: 0,
      isAvailable: true,
    });
    expect(calls(api, 'PATCH', /options\/reorder$/)).toHaveLength(1);
  });

  it('en español', async () => {
    window.localStorage.setItem('ventea.admin.lang', 'es');
    renderMenu();
    expect(await screen.findByRole('heading', { level: 1, name: 'Menú' })).toBeTruthy();
    expect(await screen.findByText('3 productos en 2 categorías')).toBeTruthy();
    expect(screen.getAllByText('Disponible').length).toBe(3);
    expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeTruthy();
  });
});
