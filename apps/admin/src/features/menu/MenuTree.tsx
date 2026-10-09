import type { StaffMenuCategory, StaffMenuItem } from '@ventea/shared';

import { useI18n } from '@/i18n';
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconGrip,
  IconImage,
  IconPlus,
  IconTrash,
} from '@/ui/icons';

import { useDragReorder } from './dnd';
import { moveId } from './reorder';

export interface TreeHandlers {
  onEditCategory: (category: StaffMenuCategory) => void;
  onDeleteCategory: (category: StaffMenuCategory) => void;
  onMoveCategory: (ids: string[], moved: StaffMenuCategory) => void;
  onAddItem: (category: StaffMenuCategory) => void;
  onEditItem: (item: StaffMenuItem) => void;
  onDeleteItem: (item: StaffMenuItem) => void;
  onToggleItem: (item: StaffMenuItem) => void;
  onMoveItem: (category: StaffMenuCategory, ids: string[], moved: StaffMenuItem) => void;
}

/**
 * Categorías con sus productos. Con permiso de edición: arrastrar (mouse) o subir/bajar
 * (teclado y táctil) para ordenar, «agotado» con un toque, editar y borrar. Mientras se busca,
 * el orden no se puede cambiar (la lista está filtrada).
 */
export function MenuTree({
  categories,
  allCategoryIds,
  currency,
  canEdit,
  canReorder,
  handlers,
}: {
  categories: StaffMenuCategory[];
  /** Orden completo (sin filtrar) de las categorías. */
  allCategoryIds: string[];
  currency: string;
  canEdit: boolean;
  canReorder: boolean;
  handlers: TreeHandlers;
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const dragProps = useDragReorder(
    allCategoryIds,
    (ids, movedId) => {
      const moved = byId.get(movedId);
      if (moved) handlers.onMoveCategory(ids, moved);
    },
    canReorder,
  );

  return (
    <ol className="menu-tree">
      {categories.map((category) => {
        const index = allCategoryIds.indexOf(category.id);
        return (
          <CategoryCard
            key={category.id}
            category={category}
            index={index}
            total={allCategoryIds.length}
            currency={currency}
            canEdit={canEdit}
            canReorder={canReorder}
            handlers={handlers}
            onMove={(delta) =>
              handlers.onMoveCategory(moveId(allCategoryIds, category.id, delta), category)
            }
            dragProps={dragProps(category.id)}
          />
        );
      })}
    </ol>
  );
}

function CategoryCard({
  category,
  index,
  total,
  currency,
  canEdit,
  canReorder,
  handlers,
  onMove,
  dragProps,
}: {
  category: StaffMenuCategory;
  index: number;
  total: number;
  currency: string;
  canEdit: boolean;
  canReorder: boolean;
  handlers: TreeHandlers;
  onMove: (delta: number) => void;
  dragProps: ReturnType<ReturnType<typeof useDragReorder>>;
}) {
  const { t } = useI18n();
  const ids = category.items.map((item) => item.id);
  const itemDrag = useDragReorder(
    ids,
    (next, movedId) => {
      const moved = category.items.find((item) => item.id === movedId);
      if (moved) handlers.onMoveItem(category, next, moved);
    },
    canReorder,
  );
  const headingId = `cat-${category.id}`;

  return (
    <li className="menu-cat" data-drop-target={dragProps['data-drop-target']}>
      <section aria-labelledby={headingId}>
        <header
          className="menu-cat__head"
          {...dragProps}
          data-drop-target={undefined}
          title={canReorder ? t('menu.dragHint') : undefined}
        >
          {canReorder && (
            <span className="menu-cat__grip" aria-hidden="true">
              <IconGrip size={18} />
            </span>
          )}
          <div className="menu-cat__title">
            <h2 id={headingId}>{category.name}</h2>
            <span className="menu-cat__meta">
              {t('menu.productCount', { count: category.items.length })}
              {!category.isActive && <span className="tag tag--muted">{t('category.hidden')}</span>}
            </span>
          </div>
          {canEdit && (
            <div className="menu-cat__actions">
              {canReorder && (
                <>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('menu.moveUp', { name: category.name })}
                    disabled={index <= 0}
                    onClick={() => onMove(-1)}
                  >
                    <IconArrowUp size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('menu.moveDown', { name: category.name })}
                    disabled={index >= total - 1}
                    onClick={() => onMove(1)}
                  >
                    <IconArrowDown size={18} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={t('category.editAria', { name: category.name })}
                onClick={() => handlers.onEditCategory(category)}
              >
                <IconEdit size={18} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label={t('category.deleteAria', { name: category.name })}
                onClick={() => handlers.onDeleteCategory(category)}
              >
                <IconTrash size={18} />
              </button>
            </div>
          )}
        </header>

        {category.items.length === 0 ? (
          <p className="menu-cat__empty">{t('category.empty')}</p>
        ) : (
          <ul className="menu-items">
            {category.items.map((item, itemIndex) => (
              <ItemRow
                key={item.id}
                item={item}
                index={itemIndex}
                total={category.items.length}
                currency={currency}
                canEdit={canEdit}
                canReorder={canReorder}
                handlers={handlers}
                onMove={(delta) => handlers.onMoveItem(category, moveId(ids, item.id, delta), item)}
                dragProps={itemDrag(item.id)}
              />
            ))}
          </ul>
        )}

        {canEdit && (
          <button
            type="button"
            className="btn btn--quiet btn--small menu-cat__add"
            onClick={() => handlers.onAddItem(category)}
          >
            <IconPlus size={18} />
            {t('menu.addProductTo', { category: category.name })}
          </button>
        )}
      </section>
    </li>
  );
}

function ItemRow({
  item,
  index,
  total,
  currency,
  canEdit,
  canReorder,
  handlers,
  onMove,
  dragProps,
}: {
  item: StaffMenuItem;
  index: number;
  total: number;
  currency: string;
  canEdit: boolean;
  canReorder: boolean;
  handlers: TreeHandlers;
  onMove: (delta: number) => void;
  dragProps: ReturnType<ReturnType<typeof useDragReorder>>;
}) {
  const { t, money } = useI18n();
  const modifiers = item.modifierGroupIds.length;

  return (
    <li className={`item-row${item.isAvailable ? '' : ' is-soldout'}`} {...dragProps}>
      {canReorder && (
        <span className="item-row__grip" aria-hidden="true" title={t('menu.dragHint')}>
          <IconGrip size={18} />
        </span>
      )}
      {item.imageUrl ? (
        <img className="item-row__thumb" src={item.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className="item-row__thumb item-row__thumb--empty" aria-hidden="true">
          <IconImage size={20} />
        </span>
      )}
      <div className="item-row__main">
        {canEdit ? (
          <button
            type="button"
            className="item-row__name item-row__name--button"
            onClick={() => handlers.onEditItem(item)}
            aria-label={t('item.editAria', { name: item.name })}
          >
            {item.name}
          </button>
        ) : (
          <span className="item-row__name">{item.name}</span>
        )}
        {item.description && <span className="item-row__desc">{item.description}</span>}
        {(item.tags.length > 0 || modifiers > 0) && (
          <span className="item-row__tags">
            {item.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
            {modifiers > 0 && (
              <span className="tag tag--muted">
                {t('item.modifierCount', { count: modifiers })}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="item-row__price">
        <span className="item-row__amount">{money(item.basePriceCents, currency)}</span>
        {item.compareAtPriceCents !== null && (
          <s className="item-row__compare">
            <span className="sr-only">{t('item.compareAtSr')} </span>
            {money(item.compareAtPriceCents, currency)}
          </s>
        )}
      </div>
      <div className="item-row__controls">
        {canEdit ? (
          <button
            type="button"
            role="switch"
            aria-checked={item.isAvailable}
            aria-label={t('item.availableAria', { name: item.name })}
            className="switch"
            onClick={() => handlers.onToggleItem(item)}
          >
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span className="switch__text">
              {item.isAvailable ? t('item.available') : t('item.soldOut')}
            </span>
          </button>
        ) : (
          <span className={`tag ${item.isAvailable ? 'tag--ok' : 'tag--danger'}`}>
            {item.isAvailable ? t('item.available') : t('item.soldOut')}
          </span>
        )}
        {canEdit && (
          <div className="item-row__actions">
            {canReorder && (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('menu.moveUp', { name: item.name })}
                  disabled={index <= 0}
                  onClick={() => onMove(-1)}
                >
                  <IconArrowUp size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('menu.moveDown', { name: item.name })}
                  disabled={index >= total - 1}
                  onClick={() => onMove(1)}
                >
                  <IconArrowDown size={18} />
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              aria-label={t('item.deleteAria', { name: item.name })}
              onClick={() => handlers.onDeleteItem(item)}
            >
              <IconTrash size={18} />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
