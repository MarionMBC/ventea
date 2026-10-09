import { useIsMutating } from '@tanstack/react-query';
import type {
  StaffMenu,
  StaffMenuCategory,
  StaffMenuItem,
  StaffModifierGroup,
} from '@ventea/shared';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useSession } from '@/app/services';
import { ConfirmDialog } from '@/features/platform/ConfirmDialog';
import { describeError, useI18n } from '@/i18n';
import { IconAlert, IconMenuBook, IconPlus, IconRefresh, IconSearch } from '@/ui/icons';

import {
  useDeleteCategory,
  useDeleteGroup,
  useDeleteItem,
  useReorderCategories,
  useReorderItems,
  useSaveCategory,
  useSetAvailability,
  useStaffMenu,
} from './api';
import { ItemDrawer } from './ItemDrawer';
import { MenuTree, type MoveDir, type TreeHandlers } from './MenuTree';
import { GroupDrawer, ModifierGroups } from './ModifierGroups';

type Tab = 'items' | 'groups';

type Editing =
  | { kind: 'item'; item: StaffMenuItem | null; categoryId: string }
  | { kind: 'group'; group: StaffModifierGroup | null };

type Deleting =
  | { kind: 'item'; item: StaffMenuItem }
  | { kind: 'category'; category: StaffMenuCategory }
  | { kind: 'group'; group: StaffModifierGroup };

interface Flash {
  tone: 'success' | 'error';
  text: string;
}

/** Filtra el árbol por nombre, descripción o etiqueta (sin distinguir mayúsculas ni tildes). */
function filterMenu(menu: StaffMenu, query: string): StaffMenuCategory[] {
  const needle = normalize(query.trim());
  if (!needle) return menu.categories;
  return menu.categories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) =>
        [item.name, item.description ?? '', ...item.tags].some((text) =>
          normalize(text).includes(needle),
        ),
      ),
    }))
    .filter((category) => category.items.length > 0 || normalize(category.name).includes(needle));
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Menú del restaurante (`/admin/menu`). Dueño y gerente editan; el resto del equipo lo ve (la
 * API responde 403 a sus escrituras). Categorías con productos, agotado con un toque, orden
 * arrastrando o con botones, editor en panel lateral y grupos de modificadores reutilizables.
 */
export function MenuPage() {
  const session = useSession();
  const role = session?.staff.role;
  const canEdit = role === 'owner' || role === 'manager';
  const i18n = useI18n();
  const { t } = i18n;
  const menu = useStaffMenu();
  const searchId = useId();
  const [tab, setTab] = useState<Tab>('items');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ category: StaffMenuCategory | null } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const saving = useIsMutating() > 0;

  const saveCategory = useSaveCategory();
  const deleteCategory = useDeleteCategory();
  const deleteItem = useDeleteItem();
  const deleteGroup = useDeleteGroup();
  const setAvailability = useSetAvailability();
  const reorderCategories = useReorderCategories();
  const reorderItems = useReorderItems();

  useEffect(() => {
    document.title = t('menu.pageTitle');
  }, [t]);

  const data = menu.data;

  /*
   * Mover con los botones reordena el DOM y el navegador saca el foco del botón (queda en
   * <body>): tras el render con el orden nuevo vuelve al mismo botón o, si quedó en un tope
   * (deshabilitado), al opuesto. Así se puede seguir moviendo con el teclado.
   */
  const refocus = useRef<{ id: string; dir: MoveDir } | null>(null);
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const button = (dir: MoveDir) =>
      document.querySelector<HTMLButtonElement>(
        `[data-move-id="${target.id}"][data-move-dir="${dir}"]`,
      );
    const same = button(target.dir);
    const next = same && !same.disabled ? same : button(target.dir === 'up' ? 'down' : 'up');
    next?.focus();
  }, [data]);
  const visible = useMemo(() => (data ? filterMenu(data, query) : []), [data, query]);
  const searching = query.trim() !== '';
  const itemCount = data?.categories.reduce((sum, c) => sum + c.items.length, 0) ?? 0;

  const fail = (error: unknown) => setFlash({ tone: 'error', text: describeError(error, i18n) });
  const ok = (text: string) => setFlash({ tone: 'success', text });

  const openDelete = (target: Deleting) => {
    deleteItem.reset();
    deleteCategory.reset();
    deleteGroup.reset();
    setDeleting(target);
  };

  const handlers: TreeHandlers = {
    onEditCategory: (category) => {
      saveCategory.reset();
      setCategoryForm({ category });
    },
    onDeleteCategory: (category) => openDelete({ kind: 'category', category }),
    onMoveCategory: (ids, moved, via) => {
      if (via) refocus.current = { id: moved.id, dir: via };
      setAnnouncement(
        t('menu.moved', {
          name: moved.name,
          position: ids.indexOf(moved.id) + 1,
          total: ids.length,
        }),
      );
      reorderCategories.mutate(ids, { onError: fail });
    },
    onAddItem: (category) => setEditing({ kind: 'item', item: null, categoryId: category.id }),
    onEditItem: (item) => setEditing({ kind: 'item', item, categoryId: item.categoryId }),
    onDeleteItem: (item) => openDelete({ kind: 'item', item }),
    onToggleItem: (item) => {
      setFlash(null);
      const isAvailable = !item.isAvailable;
      setAnnouncement(
        t(isAvailable ? 'item.nowAvailable' : 'item.nowSoldOut', { name: item.name }),
      );
      setAvailability.mutate({ id: item.id, isAvailable }, { onError: fail });
    },
    onMoveItem: (category, ids, moved, via) => {
      if (via) refocus.current = { id: moved.id, dir: via };
      setAnnouncement(
        t('menu.moved', {
          name: moved.name,
          position: ids.indexOf(moved.id) + 1,
          total: ids.length,
        }),
      );
      reorderItems.mutate({ categoryId: category.id, ids }, { onError: fail });
    },
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const done = () => setDeleting(null);
    if (deleting.kind === 'item') {
      deleteItem.mutate(deleting.item.id, {
        onSuccess: (result) => {
          done();
          ok(
            t(result.deleted === 'soft' ? 'item.deletedSoft' : 'item.deleted', {
              name: deleting.item.name,
            }),
          );
        },
      });
    } else if (deleting.kind === 'category') {
      deleteCategory.mutate(deleting.category.id, {
        onSuccess: () => {
          done();
          ok(t('category.deleted', { name: deleting.category.name }));
        },
      });
    } else {
      deleteGroup.mutate(deleting.group.id, {
        onSuccess: () => {
          done();
          ok(t('group.deleted', { name: deleting.group.name }));
        },
      });
    }
  };
  const deletePending = deleteItem.isPending || deleteCategory.isPending || deleteGroup.isPending;
  const deleteError = deleteItem.error ?? deleteCategory.error ?? deleteGroup.error;

  const header = (
    <header className="page-head">
      <div className="page-head__text">
        <h1 id="menu-title" className="page-head__title">
          {t('menu.title')}
        </h1>
        <p className="page-head__sub">
          {data
            ? t('menu.summary', {
                products: t('menu.productCount', { count: itemCount }),
                categories: t('menu.categoryCount', { count: data.categories.length }),
              })
            : t('menu.subtitle')}
        </p>
      </div>
      {canEdit && data && (
        <div className="page-head__actions">
          {tab === 'items' ? (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  saveCategory.reset();
                  setCategoryForm({ category: null });
                }}
              >
                <IconPlus size={18} />
                {t('category.new')}
              </button>
              {data.categories.length > 0 && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() =>
                    setEditing({ kind: 'item', item: null, categoryId: data.categories[0]!.id })
                  }
                >
                  <IconPlus size={18} />
                  {t('item.new')}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setEditing({ kind: 'group', group: null })}
            >
              <IconPlus size={18} />
              {t('group.new')}
            </button>
          )}
        </div>
      )}
    </header>
  );

  if (menu.error && !data) {
    return (
      <section className="page menu" aria-labelledby="menu-title">
        {header}
        <div className="state state--error" role="alert">
          <span className="state__icon">
            <IconAlert size={28} />
          </span>
          <h2>{t('menu.errorTitle')}</h2>
          <p>{describeError(menu.error, i18n)}</p>
          <button type="button" className="btn btn--primary" onClick={() => void menu.refetch()}>
            <IconRefresh size={18} />
            {t('board.retry')}
          </button>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page menu" aria-labelledby="menu-title">
        {header}
        <div role="status">
          <span className="sr-only">{t('menu.loading')}</span>
          <div className="menu-tree" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="menu-cat card--skeleton">
                <span className="skeleton" style={{ width: '30%', height: 20 }} />
                {[0, 1, 2].map((j) => (
                  <span key={j} className="skeleton" style={{ width: '100%', height: 56 }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page menu" aria-labelledby="menu-title">
      {header}

      <div className="toolbar menu__toolbar">
        <div className="segmented" role="tablist" aria-label={t('menu.views')}>
          {(['items', 'groups'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`menu-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`menu-panel-${value}`}
              className={`segmented__item${tab === value ? ' active' : ''}`}
              onClick={() => setTab(value)}
            >
              {value === 'items' ? t('menu.tabProducts') : t('menu.tabGroups')}
              <span className="segmented__count">
                {value === 'items' ? itemCount : data.modifierGroups.length}
              </span>
            </button>
          ))}
        </div>
        {tab === 'items' && (
          <div className="search">
            <label htmlFor={searchId} className="sr-only">
              {t('menu.search')}
            </label>
            <IconSearch size={18} className="search__icon" />
            <input
              id={searchId}
              className="field__input search__input"
              type="search"
              placeholder={t('menu.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
        <span className="menu__saving" role="status">
          {saving ? t('common.saving') : ''}
        </span>
      </div>

      {flash && (
        <div className={flash.tone === 'success' ? 'flash' : 'form-error'} role="alert">
          <span>{flash.text}</span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {!canEdit && <p className="banner banner--info">{t('menu.readOnly')}</p>}

      {tab === 'items' ? (
        <div id="menu-panel-items" role="tabpanel" aria-labelledby="menu-tab-items">
          {data.categories.length === 0 ? (
            <div className="state state--empty">
              <span className="state__icon">
                <IconMenuBook size={28} />
              </span>
              <h2>{t('menu.emptyTitle')}</h2>
              <p>{canEdit ? t('menu.emptyBody') : t('menu.emptyBodyReadOnly')}</p>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    saveCategory.reset();
                    setCategoryForm({ category: null });
                  }}
                >
                  <IconPlus size={18} />
                  {t('category.new')}
                </button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div className="state state--empty">
              <span className="state__icon">
                <IconSearch size={28} />
              </span>
              <h2>{t('menu.noResults', { query: query.trim() })}</h2>
              <button type="button" className="btn btn--ghost" onClick={() => setQuery('')}>
                {t('menu.clearSearch')}
              </button>
            </div>
          ) : (
            <>
              {canEdit && !searching && <p className="menu__hint">{t('menu.reorderHint')}</p>}
              <MenuTree
                categories={visible}
                allCategoryIds={data.categories.map((c) => c.id)}
                currency={data.currency}
                canEdit={canEdit}
                canReorder={canEdit && !searching}
                handlers={handlers}
              />
            </>
          )}
        </div>
      ) : (
        <div id="menu-panel-groups" role="tabpanel" aria-labelledby="menu-tab-groups">
          <ModifierGroups
            menu={data}
            canEdit={canEdit}
            onNew={() => setEditing({ kind: 'group', group: null })}
            onEdit={(group) => setEditing({ kind: 'group', group })}
            onDelete={(group) => openDelete({ kind: 'group', group })}
          />
        </div>
      )}

      {editing?.kind === 'item' && (
        <ItemDrawer
          menu={data}
          item={editing.item}
          categoryId={editing.categoryId}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            ok(t('item.saved', { name }));
          }}
        />
      )}
      {editing?.kind === 'group' && (
        <GroupDrawer
          menu={data}
          group={editing.group}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            ok(t('group.saved', { name }));
          }}
        />
      )}

      {categoryForm && (
        <CategoryDialog
          category={categoryForm.category}
          pending={saveCategory.isPending}
          error={saveCategory.error ? describeError(saveCategory.error, i18n) : undefined}
          onCancel={() => setCategoryForm(null)}
          onSave={(input) =>
            saveCategory.mutate(
              { id: categoryForm.category?.id, ...input },
              {
                onSuccess: () => {
                  setCategoryForm(null);
                  ok(t('category.saved', { name: input.name }));
                },
              },
            )
          }
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('menu.deleteTitle', {
            name:
              deleting.kind === 'item'
                ? deleting.item.name
                : deleting.kind === 'category'
                  ? deleting.category.name
                  : deleting.group.name,
          })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          pendingLabel={t('common.deleting')}
          danger
          pending={deletePending}
          error={deleteError ? describeError(deleteError, i18n) : undefined}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          <p>
            {deleting.kind === 'item'
              ? t('item.deleteBody')
              : deleting.kind === 'category'
                ? deleting.category.items.length > 0
                  ? t('category.deleteNotEmpty', { count: deleting.category.items.length })
                  : t('category.deleteBody')
                : t('group.deleteBody', { count: deleting.group.itemCount })}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function CategoryDialog({
  category,
  pending,
  error,
  onCancel,
  onSave,
}: {
  category: StaffMenuCategory | null;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (input: { name: string; isActive: boolean }) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [name, setName] = useState(category?.name ?? '');
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [invalid, setInvalid] = useState(false);

  return (
    <ConfirmDialog
      title={category ? t('category.editTitle') : t('category.newTitle')}
      confirmLabel={t('common.save')}
      cancelLabel={t('common.cancel')}
      pendingLabel={t('common.saving')}
      pending={pending}
      error={invalid ? t('category.nameRequired') : error}
      onCancel={onCancel}
      onConfirm={() => {
        if (!name.trim()) {
          setInvalid(true);
          return;
        }
        onSave({ name: name.trim(), isActive });
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor={`${id}-name`}>
          {t('category.name')}
        </label>
        <input
          id={`${id}-name`}
          className="field__input"
          value={name}
          maxLength={80}
          placeholder={t('category.namePlaceholder')}
          aria-invalid={invalid}
          onChange={(event) => {
            setName(event.target.value);
            setInvalid(false);
          }}
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        <span>
          <span className="check__label">{t('category.visible')}</span>
          <span className="field__hint">{t('category.visibleHint')}</span>
        </span>
      </label>
    </ConfirmDialog>
  );
}
