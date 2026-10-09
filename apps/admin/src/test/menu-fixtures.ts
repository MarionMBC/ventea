import type { StaffMenu, StaffMenuItem } from '@ventea/shared';

import { apiError, json, type FakeRequest, type Handler } from './fixtures';

/** Menú falso con estado para los tests de las pantallas de Menú y Mi marca. Nada de red real. */

let seq = 100;
export const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export const CAT_SANDWICHES = '00000000-0000-4000-8000-000000000001';
export const CAT_SIDES = '00000000-0000-4000-8000-000000000002';
export const GROUP_SPICE = '00000000-0000-4000-8000-000000000003';

function item(overrides: Partial<StaffMenuItem>): StaffMenuItem {
  return {
    id: id(),
    categoryId: CAT_SANDWICHES,
    name: 'Item',
    description: null,
    imageUrl: null,
    basePriceCents: 1000,
    compareAtPriceCents: null,
    tags: [],
    isAvailable: true,
    sortOrder: 0,
    modifierGroupIds: [],
    ...overrides,
  };
}

export function makeMenu(): StaffMenu {
  return {
    currency: 'USD',
    categories: [
      {
        id: CAT_SANDWICHES,
        name: 'Sandwiches',
        sortOrder: 0,
        isActive: true,
        items: [
          item({
            name: 'Reaper Sandwich',
            description: 'Hot chicken on brioche',
            basePriceCents: 1290,
            compareAtPriceCents: 1650,
            tags: ['hot'],
            modifierGroupIds: [GROUP_SPICE],
            imageUrl: 'http://localhost/api/media/t/a.webp',
          }),
          item({ name: 'Classic Sandwich', basePriceCents: 990, sortOrder: 1 }),
        ],
      },
      {
        id: CAT_SIDES,
        name: 'Sides',
        sortOrder: 1,
        isActive: true,
        items: [item({ name: 'Fries', categoryId: CAT_SIDES, basePriceCents: 400 })],
      },
    ],
    modifierGroups: [
      {
        id: GROUP_SPICE,
        name: 'Spice level',
        minSelect: 1,
        maxSelect: 1,
        itemCount: 1,
        options: [
          { id: id(), name: 'Mild', priceDeltaCents: 0, isAvailable: true, sortOrder: 0 },
          { id: id(), name: 'Reaper', priceDeltaCents: 150, isAvailable: true, sortOrder: 1 },
        ],
      },
    ],
  };
}

const allItems = (menu: StaffMenu) => menu.categories.flatMap((c) => c.items);

/**
 * Rutas de `/api/staff/menu*` y `/api/staff/media` sobre `state.menu`. Aplica los cambios como
 * la API (lo justo para que las pantallas recarguen y muestren el resultado).
 */
export function menuHandler(state: { menu: StaffMenu }): Handler {
  return (req: FakeRequest) => {
    const { method, path } = req;
    const body = req.body as Record<string, unknown>;
    const menu = state.menu;

    if (method === 'GET' && path === '/api/staff/menu') return json(menu);

    if (method === 'POST' && path === '/api/staff/media') {
      if (!(req.body instanceof FormData) || !req.body.get('file')) {
        return apiError(400, 'Falta el archivo');
      }
      return json(
        {
          url: 'http://localhost/api/media/t/new.webp',
          thumbUrl: 'http://localhost/api/media/t/new.thumb.webp',
          width: 800,
          height: 600,
        },
        201,
      );
    }

    if (method === 'POST' && path === '/api/staff/menu/categories') {
      const created = {
        id: id(),
        name: String(body.name),
        sortOrder: menu.categories.length,
        isActive: body.isActive !== false,
        items: [],
      };
      menu.categories.push(created);
      return json({ id: created.id }, 201);
    }
    if (method === 'PATCH' && path === '/api/staff/menu/categories/reorder') {
      const ids = (body.items as { id: string }[]).map((i) => i.id);
      menu.categories.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return new Response(null, { status: 204 });
    }
    const category = path.match(/^\/api\/staff\/menu\/categories\/([^/]+)$/);
    if (category) {
      const found = menu.categories.find((c) => c.id === category[1]);
      if (!found) return apiError(404, 'Categoría no encontrada');
      if (method === 'DELETE') {
        if (found.items.length > 0) return apiError(409, 'La categoría tiene productos');
        menu.categories = menu.categories.filter((c) => c !== found);
      } else Object.assign(found, body);
      return new Response(null, { status: 204 });
    }

    if (method === 'POST' && path === '/api/staff/menu/items') {
      const created = item({ ...(body as Partial<StaffMenuItem>), id: id() });
      menu.categories.find((c) => c.id === created.categoryId)?.items.push(created);
      return json({ id: created.id }, 201);
    }
    if (method === 'PATCH' && path === '/api/staff/menu/items/reorder') {
      const ids = (body.items as { id: string }[]).map((i) => i.id);
      for (const c of menu.categories) {
        c.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      }
      return new Response(null, { status: 204 });
    }
    const availability = path.match(/^\/api\/staff\/menu\/items\/([^/]+)\/availability$/);
    if (availability) {
      const found = allItems(menu).find((i) => i.id === availability[1]);
      if (!found) return apiError(404, 'Producto no encontrado');
      found.isAvailable = body.isAvailable as boolean;
      return new Response(null, { status: 204 });
    }
    const itemPath = path.match(/^\/api\/staff\/menu\/items\/([^/]+)$/);
    if (itemPath) {
      const found = allItems(menu).find((i) => i.id === itemPath[1]);
      if (!found) return apiError(404, 'Producto no encontrado');
      for (const c of menu.categories) c.items = c.items.filter((i) => i !== found);
      if (method === 'DELETE') return json({ deleted: 'hard' });
      Object.assign(found, body);
      menu.categories.find((c) => c.id === found.categoryId)?.items.push(found);
      return new Response(null, { status: 204 });
    }

    if (method === 'POST' && path === '/api/staff/menu/modifier-groups') {
      const created = {
        id: id(),
        name: String(body.name),
        minSelect: Number(body.minSelect),
        maxSelect: Number(body.maxSelect),
        itemCount: 0,
        options: (body.options as { name: string; priceDeltaCents: number }[]).map((o, i) => ({
          id: id(),
          isAvailable: true,
          sortOrder: i,
          ...o,
        })),
      };
      menu.modifierGroups.push(created);
      return json({ id: created.id }, 201);
    }
    const group = path.match(/^\/api\/staff\/menu\/modifier-groups\/([^/]+)$/);
    if (group) {
      const found = menu.modifierGroups.find((g) => g.id === group[1]);
      if (!found) return apiError(404, 'Grupo no encontrado');
      if (method === 'DELETE') menu.modifierGroups = menu.modifierGroups.filter((g) => g !== found);
      else Object.assign(found, body);
      return new Response(null, { status: 204 });
    }
    const options = path.match(/^\/api\/staff\/menu\/modifier-groups\/([^/]+)\/options$/);
    if (options && method === 'POST') {
      const found = menu.modifierGroups.find((g) => g.id === options[1])!;
      const created = {
        id: id(),
        name: String(body.name),
        priceDeltaCents: Number(body.priceDeltaCents ?? 0),
        isAvailable: body.isAvailable !== false,
        sortOrder: found.options.length,
      };
      found.options.push(created);
      return json({ id: created.id }, 201);
    }
    if (/\/options\/reorder$/.test(path)) return new Response(null, { status: 204 });
    const option = path.match(/^\/api\/staff\/menu\/modifier-options\/([^/]+)$/);
    if (option) {
      for (const g of menu.modifierGroups) {
        const found = g.options.find((o) => o.id === option[1]);
        if (!found) continue;
        if (method === 'DELETE') g.options = g.options.filter((o) => o !== found);
        else Object.assign(found, body);
      }
      return new Response(null, { status: 204 });
    }
    return undefined;
  };
}
