import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteMenuItemResultSchema,
  staffMenuSchema,
  type CreateMenuItemInput,
  type CreateModifierGroupInput,
  type DeleteMenuItemResult,
  type StaffMenu,
  type StaffMenuItem,
  type UpdateMenuItemInput,
  type UpdateModifierGroupInput,
} from '@ventea/shared';

import { useApi } from '@/app/services';
import type { ApiClient } from '@/lib/api';

import { reorderBody, sortByIds } from './reorder';

export const MENU_QUERY_KEY = ['staff-menu'] as const;

/** Árbol completo del menú para el panel (`GET /api/staff/menu`), con inactivos y agotados. */
export function useStaffMenu() {
  const client = useApi();
  return useQuery({
    queryKey: MENU_QUERY_KEY,
    queryFn: ({ signal }) =>
      client.request<StaffMenu>('/staff/menu', { schema: staffMenuSchema, signal }),
  });
}

const enc = encodeURIComponent;

/** Menú con un ítem cambiado (para la vista optimista). */
export function patchItem(menu: StaffMenu, id: string, patch: Partial<StaffMenuItem>): StaffMenu {
  return {
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  };
}

/**
 * Mutación del menú: al terminar (bien o mal) se recarga el árbol. Con `optimistic`, el cambio
 * se ve al instante y, si la API lo rechaza, vuelve la foto anterior.
 */
function useMenuMutation<TVars, TResult = unknown>(
  run: (client: ApiClient, vars: TVars) => Promise<TResult>,
  optimistic?: (menu: StaffMenu, vars: TVars) => StaffMenu,
) {
  const client = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => run(client, vars),
    onMutate: async (vars: TVars) => {
      if (!optimistic) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: MENU_QUERY_KEY });
      const previous = queryClient.getQueryData<StaffMenu>(MENU_QUERY_KEY);
      if (previous) queryClient.setQueryData(MENU_QUERY_KEY, optimistic(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(MENU_QUERY_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MENU_QUERY_KEY }),
  });
}

// ─── Categorías ──────────────────────────────────────────────────────────────

export function useSaveCategory() {
  return useMenuMutation(
    (client, input: { id?: string; name?: string; isActive?: boolean }) => {
      const { id, ...body } = input;
      return id
        ? client.request(`/staff/menu/categories/${enc(id)}`, { method: 'PATCH', body })
        : client.request<{ id: string }>('/staff/menu/categories', { method: 'POST', body });
    },
    (menu, { id, ...patch }) =>
      id
        ? {
            ...menu,
            categories: menu.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          }
        : menu,
  );
}

export function useDeleteCategory() {
  return useMenuMutation((client, id: string) =>
    client.request(`/staff/menu/categories/${enc(id)}`, { method: 'DELETE' }),
  );
}

export function useReorderCategories() {
  return useMenuMutation(
    (client, ids: string[]) =>
      client.request('/staff/menu/categories/reorder', {
        method: 'PATCH',
        body: reorderBody(ids),
      }),
    (menu, ids) => ({ ...menu, categories: sortByIds(menu.categories, ids) }),
  );
}

// ─── Ítems ───────────────────────────────────────────────────────────────────

export function useCreateItem() {
  return useMenuMutation((client, body: CreateMenuItemInput) =>
    client.request<{ id: string }>('/staff/menu/items', { method: 'POST', body }),
  );
}

export function useUpdateItem() {
  return useMenuMutation((client, { id, patch }: { id: string; patch: UpdateMenuItemInput }) =>
    client.request(`/staff/menu/items/${enc(id)}`, { method: 'PATCH', body: patch }),
  );
}

/** «Agotado hoy»: se ve al instante y vuelve atrás si la API falla. */
export function useSetAvailability() {
  return useMenuMutation(
    (client, { id, isAvailable }: { id: string; isAvailable: boolean }) =>
      client.request(`/staff/menu/items/${enc(id)}/availability`, {
        method: 'PATCH',
        body: { isAvailable },
      }),
    (menu, { id, isAvailable }) => patchItem(menu, id, { isAvailable }),
  );
}

export function useDeleteItem() {
  return useMenuMutation((client, id: string): Promise<DeleteMenuItemResult> =>
    client.request(`/staff/menu/items/${enc(id)}`, {
      method: 'DELETE',
      schema: deleteMenuItemResultSchema,
    }),
  );
}

export function useReorderItems() {
  return useMenuMutation(
    (client, { ids }: { categoryId: string; ids: string[] }) =>
      client.request('/staff/menu/items/reorder', { method: 'PATCH', body: reorderBody(ids) }),
    (menu, { categoryId, ids }) => ({
      ...menu,
      categories: menu.categories.map((c) =>
        c.id === categoryId ? { ...c, items: sortByIds(c.items, ids) } : c,
      ),
    }),
  );
}

// ─── Modificadores ───────────────────────────────────────────────────────────

export interface OptionDraft {
  /** `undefined` = opción nueva. */
  id?: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface GroupDraft {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: OptionDraft[];
}

/**
 * Guarda un grupo. Nuevo: un solo `POST` con sus opciones. Existente: la API tiene rutas por
 * opción, así que se aplica la diferencia (borradas, cambiadas, nuevas) y al final el orden.
 */
export async function saveGroup(
  client: ApiClient,
  original: StaffMenu['modifierGroups'][number] | null,
  draft: GroupDraft,
): Promise<void> {
  if (!original) {
    const body: CreateModifierGroupInput = {
      name: draft.name,
      minSelect: draft.minSelect,
      maxSelect: draft.maxSelect,
      options: draft.options.map(({ name, priceDeltaCents, isAvailable }) => ({
        name,
        priceDeltaCents,
        isAvailable,
      })),
    };
    await client.request('/staff/menu/modifier-groups', { method: 'POST', body });
    return;
  }

  const groupPatch: UpdateModifierGroupInput = {};
  if (draft.name !== original.name) groupPatch.name = draft.name;
  if (draft.minSelect !== original.minSelect) groupPatch.minSelect = draft.minSelect;
  if (draft.maxSelect !== original.maxSelect) groupPatch.maxSelect = draft.maxSelect;
  if (Object.keys(groupPatch).length > 0) {
    await client.request(`/staff/menu/modifier-groups/${enc(original.id)}`, {
      method: 'PATCH',
      body: groupPatch,
    });
  }

  const kept = new Set(draft.options.flatMap((o) => (o.id ? [o.id] : [])));
  for (const option of original.options) {
    if (!kept.has(option.id)) {
      await client.request(`/staff/menu/modifier-options/${enc(option.id)}`, { method: 'DELETE' });
    }
  }

  const ids: string[] = [];
  for (const option of draft.options) {
    const before = option.id ? original.options.find((o) => o.id === option.id) : undefined;
    if (!before) {
      const created = await client.request<{ id: string }>(
        `/staff/menu/modifier-groups/${enc(original.id)}/options`,
        {
          method: 'POST',
          body: {
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
            isAvailable: option.isAvailable,
          },
        },
      );
      ids.push(created.id);
      continue;
    }
    const patch: Partial<OptionDraft> = {};
    if (option.name !== before.name) patch.name = option.name;
    if (option.priceDeltaCents !== before.priceDeltaCents) {
      patch.priceDeltaCents = option.priceDeltaCents;
    }
    if (option.isAvailable !== before.isAvailable) patch.isAvailable = option.isAvailable;
    if (Object.keys(patch).length > 0) {
      await client.request(`/staff/menu/modifier-options/${enc(before.id)}`, {
        method: 'PATCH',
        body: patch,
      });
    }
    ids.push(before.id);
  }

  const previousOrder = original.options.filter((o) => kept.has(o.id)).map((o) => o.id);
  const reordered =
    ids.length !== previousOrder.length || ids.some((id, index) => id !== previousOrder[index]);
  if (ids.length > 0 && reordered) {
    await client.request(`/staff/menu/modifier-groups/${enc(original.id)}/options/reorder`, {
      method: 'PATCH',
      body: reorderBody(ids),
    });
  }
}

export function useSaveGroup() {
  return useMenuMutation(
    (
      client,
      {
        original,
        draft,
      }: { original: StaffMenu['modifierGroups'][number] | null; draft: GroupDraft },
    ) => saveGroup(client, original, draft),
  );
}

export function useDeleteGroup() {
  return useMenuMutation((client, id: string) =>
    client.request(`/staff/menu/modifier-groups/${enc(id)}`, { method: 'DELETE' }),
  );
}
