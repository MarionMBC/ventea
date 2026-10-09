import type { RewardCatalogItem, RewardCustomer, StaffRewards } from '@ventea/shared';
import { useEffect, useId, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useSession } from '@/app/services';
import { useStaffMenu } from '@/features/menu/api';
import { ConfirmDialog } from '@/features/platform/ConfirmDialog';
import { describeError, useI18n } from '@/i18n';
import {
  IconAlert,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStar,
  IconTrash,
  IconUsers,
} from '@/ui/icons';

import { useDeleteReward, useRewardCustomers, useRewards } from './api';
import { CustomerDrawer, customerLabel } from './CustomerDrawer';
import { ProgramCard } from './ProgramCard';
import { RewardDrawer } from './RewardDrawer';

/**
 * Puntos (`/admin/rewards`, solo el dueño): reglas del programa, catálogo de recompensas y
 * clientes con su saldo, con ajustes y canjes auditados.
 */
export function RewardsPage() {
  const session = useSession();
  const isOwner = session?.staff.role === 'owner';
  const i18n = useI18n();
  const { t } = i18n;
  const rewards = useRewards(isOwner);

  useEffect(() => {
    document.title = t('rewards.pageTitle');
  }, [t]);

  if (session && !isOwner) return <Navigate to="/orders" replace />;

  if (rewards.error && !rewards.data) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('rewards.errorTitle')}</h1>
        <p>{describeError(rewards.error, i18n)}</p>
        <button type="button" className="btn btn--primary" onClick={() => void rewards.refetch()}>
          <IconRefresh size={18} />
          {t('board.retry')}
        </button>
      </div>
    );
  }
  if (!rewards.data) {
    return (
      <div className="page" role="status">
        <span className="sr-only">{t('rewards.loading')}</span>
        <div className="page-grid" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="card card--skeleton">
              <span className="skeleton" style={{ width: '40%', height: 22 }} />
              <span className="skeleton" style={{ width: '90%', height: 14 }} />
              <span className="skeleton" style={{ width: '75%', height: 14 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="page rw" aria-labelledby="rewards-title">
      <header className="page-head">
        <div className="page-head__text">
          <h1 id="rewards-title" className="page-head__title">
            {t('rewards.title')}
          </h1>
          <p className="page-head__sub">{t('rewards.subtitle')}</p>
        </div>
      </header>

      <div className="rw__layout">
        {/* `key`: tras guardar, el formulario arranca de lo que quedó en el servidor. */}
        <ProgramCard
          key={JSON.stringify(rewards.data.program)}
          program={rewards.data.program}
          currency={rewards.data.currency}
        />
        <CatalogCard data={rewards.data} />
      </div>
      <CustomersCard data={rewards.data} />
    </section>
  );
}

function CatalogCard({ data }: { data: StaffRewards }) {
  const i18n = useI18n();
  const { t, money } = i18n;
  const id = useId();
  const menu = useStaffMenu();
  const remove = useDeleteReward();
  const [editing, setEditing] = useState<RewardCatalogItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RewardCatalogItem | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const describe = (reward: RewardCatalogItem) =>
    reward.kind === 'discount'
      ? t('rewards.kind.discount', { amount: money(reward.discountCents ?? 0, data.currency) })
      : (reward.menuItemName ?? t('rewards.itemGone'));

  return (
    <article className="card" aria-labelledby={`${id}-title`}>
      <div className="card__head">
        <span className="card__icon" aria-hidden="true">
          <IconStar size={20} />
        </span>
        <h2 id={`${id}-title`}>{t('rewards.catalog')}</h2>
        <button
          type="button"
          className="btn btn--ghost btn--small rw__add"
          onClick={() => {
            setFlash(null);
            setEditing('new');
          }}
        >
          <IconPlus size={18} />
          {t('rewards.add')}
        </button>
      </div>
      <p className="muted">{t('rewards.catalogHint')}</p>
      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}

      {data.catalog.length === 0 ? (
        <p className="rw-empty">{t('rewards.catalogEmpty')}</p>
      ) : (
        <ul className="rw-catalog">
          {data.catalog.map((reward) => (
            <li key={reward.id} className={`rw-catalog__row${reward.isActive ? '' : ' is-hidden'}`}>
              <span className="rw-catalog__cost">
                {t('rewards.points', { count: reward.pointsCost })}
              </span>
              <span className="rw-catalog__text">
                <span className="rw-catalog__name">{reward.name}</span>
                <span
                  className={`rw-catalog__meta${
                    reward.kind === 'item' && !reward.menuItemName ? ' is-warning' : ''
                  }`}
                >
                  {describe(reward)}
                  {!reward.isActive && (
                    <span className="tag tag--muted rw-catalog__tag">{t('rewards.hidden')}</span>
                  )}
                </span>
              </span>
              <span className="rw-catalog__actions">
                <button
                  type="button"
                  className="btn btn--quiet btn--icon"
                  aria-label={t('rewards.editAria', { name: reward.name })}
                  onClick={() => {
                    setFlash(null);
                    setEditing(reward);
                  }}
                >
                  <IconEdit size={18} />
                </button>
                <button
                  type="button"
                  className="btn btn--quiet btn--icon btn--danger-text"
                  aria-label={t('rewards.deleteAria', { name: reward.name })}
                  onClick={() => {
                    remove.reset();
                    setDeleting(reward);
                  }}
                >
                  <IconTrash size={18} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RewardDrawer
          reward={editing === 'new' ? null : editing}
          menu={menu.data}
          currency={data.currency}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setFlash(t('rewards.savedReward', { name }));
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('rewards.deleteTitle', { name: deleting.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          pendingLabel={t('common.deleting')}
          danger
          pending={remove.isPending}
          error={remove.error ? describeError(remove.error, i18n) : undefined}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setFlash(t('rewards.deleted', { name: deleting.name }));
                setDeleting(null);
              },
            })
          }
          onCancel={() => setDeleting(null)}
        >
          <p>{t('rewards.deleteBody')}</p>
        </ConfirmDialog>
      )}
    </article>
  );
}

/** Espera `ms` sin cambios antes de devolver el valor (búsqueda mientras se escribe). */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function CustomersCard({ data }: { data: StaffRewards }) {
  const i18n = useI18n();
  const { t, day } = i18n;
  const id = useId();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<RewardCustomer | null>(null);
  const customers = useRewardCustomers(q, page);
  const result = customers.data;
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <article className="card rw-customers" aria-labelledby={`${id}-title`}>
      <div className="card__head">
        <span className="card__icon" aria-hidden="true">
          <IconUsers size={20} />
        </span>
        <h2 id={`${id}-title`}>{t('rewards.customers')}</h2>
        {result && (
          <span className="muted rw-customers__count">
            {t('rewards.customerCount', { count: result.total })}
          </span>
        )}
      </div>
      <p className="muted">{t('rewards.customersHint')}</p>

      <div className="search rw-customers__search">
        <span className="search__icon" aria-hidden="true">
          <IconSearch size={18} />
        </span>
        <input
          type="search"
          className="field__input search__input"
          aria-label={t('rewards.search')}
          placeholder={t('rewards.search')}
          maxLength={100}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {customers.error && !result ? (
        <p className="form-error" role="alert">
          {describeError(customers.error, i18n)}
        </p>
      ) : !result ? (
        <p className="muted" role="status">
          {t('rewards.loading')}
        </p>
      ) : result.items.length === 0 ? (
        <p className="rw-empty">
          {q ? t('rewards.noMatches', { q }) : t('rewards.customersEmpty')}
        </p>
      ) : (
        <>
          <div className="rw-table-wrap">
            <table
              className="rw-table"
              aria-labelledby={`${id}-title`}
              aria-busy={customers.isFetching}
            >
              <thead>
                <tr>
                  <th scope="col">{t('rewards.colCustomer')}</th>
                  <th scope="col" className="num">
                    {t('rewards.colBalance')}
                  </th>
                  <th scope="col" className="num">
                    {t('rewards.colEarned')}
                  </th>
                  <th scope="col">{t('rewards.colLast')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('rewards.manage')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((customer) => {
                  const label = customerLabel(customer);
                  return (
                    <tr key={customer.id}>
                      <td className="rw-table__who">
                        <span className="rw-table__name">{label}</span>
                        {label !== customer.email && (
                          <span className="rw-table__email">{customer.email}</span>
                        )}
                      </td>
                      <td className="num rw-table__balance">
                        <span className="rw-table__cell-label" aria-hidden="true">
                          {t('rewards.colBalance')}
                        </span>
                        {customer.balance}
                      </td>
                      <td className="num rw-table__earned">
                        <span className="rw-table__cell-label" aria-hidden="true">
                          {t('rewards.colEarned')}
                        </span>
                        {customer.lifetimeEarned}
                      </td>
                      <td className="rw-table__last">
                        {customer.lastActivityAt
                          ? day(customer.lastActivityAt)
                          : t('rewards.never')}
                      </td>
                      <td className="rw-table__action">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          aria-label={t('rewards.manageAria', { name: label })}
                          onClick={() => setOpen(customer)}
                        >
                          {t('rewards.manage')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="rw-pager" aria-label={t('rewards.customers')}>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={page <= 1 || customers.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('rewards.prev')}
              </button>
              <span className="muted" aria-live="polite">
                {t('rewards.pageOf', { page, pages })}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={page >= pages || customers.isFetching}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                {t('rewards.next')}
              </button>
            </nav>
          )}
        </>
      )}

      {open && (
        <CustomerDrawer
          customer={open}
          rewards={data.catalog}
          programEnabled={data.program.isEnabled}
          onClose={() => setOpen(null)}
        />
      )}
    </article>
  );
}
