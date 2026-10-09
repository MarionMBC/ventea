import {
  ASSIGNABLE_ROLE,
  type AssignableRole,
  type TeamInvitation,
  type TeamMember,
  type TenantRole,
} from '@ventea/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useSession } from '@/app/services';
import { useTenant } from '@/app/tenant';
import { ConfirmDialog } from '@/features/platform/ConfirmDialog';
import { describeError, useI18n } from '@/i18n';
import { brandName } from '@/ui/Brand';
import { Drawer } from '@/ui/Drawer';
import { IconAlert, IconLock, IconPlus, IconRefresh, IconUsers } from '@/ui/icons';
import { PlanUsage, usageFull } from '@/ui/PlanUsage';

import { useInvite, usePasswordReset, useRevokeInvitation, useTeam, useUpdateMember } from './api';
import { LinkPanel } from './LinkPanel';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: readonly TenantRole[] = ['owner', 'manager', 'staff'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** Invitar (o generar un enlace nuevo para una invitación pendiente) y mostrar el enlace. */
function InviteDrawer({
  initial,
  onClose,
}: {
  initial?: { email: string; role: AssignableRole };
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const id = useId();
  const invite = useInvite();
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<AssignableRole>(initial?.role ?? 'staff');
  const [error, setError] = useState<string | null>(null);
  const created = invite.data;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invite.isPending) return;
    if (!EMAIL.test(email.trim())) {
      setError(t('team.emailInvalid'));
      return;
    }
    invite.mutate({ email: email.trim().toLowerCase(), role });
  };

  return (
    <Drawer
      title={
        created ? t('team.inviteReady', { email: created.invitation.email }) : t('team.inviteTitle')
      }
      busy={invite.isPending}
      onClose={onClose}
      footer={
        created ? (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('team.done')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={invite.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form={`${id}-form`}
              className="btn btn--primary"
              disabled={invite.isPending}
            >
              {invite.isPending ? t('team.inviting') : t('team.sendInvite')}
            </button>
          </>
        )
      }
    >
      {created ? (
        <LinkPanel
          kind="invitation"
          token={created.token}
          email={created.invitation.email}
          expiresAt={created.expiresAt}
        />
      ) : (
        <form id={`${id}-form`} className="form-grid" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-email`}>
              {t('team.email')}
            </label>
            <input
              id={`${id}-email`}
              data-autofocus
              className="field__input"
              type="email"
              autoComplete="off"
              value={email}
              readOnly={!!initial}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-email-error` : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
            />
            {error && (
              <p id={`${id}-email-error`} className="field__error">
                {error}
              </p>
            )}
          </div>
          <fieldset className="fieldset">
            <legend className="field__label">{t('team.role')}</legend>
            {ASSIGNABLE_ROLE.map((value) => (
              <label key={value} className="check">
                <input
                  type="radio"
                  name={`${id}-role`}
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                <span>
                  <span className="check__label">{t(`role.${value}`)}</span>
                  <span className="field__hint">{t(`roleHelp.${value}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {invite.error && (
            <p className="form-error" role="alert">
              {describeError(invite.error, i18n)}
            </p>
          )}
        </form>
      )}
    </Drawer>
  );
}

/** Enlace de contraseña nueva para un miembro: confirmar, crear y mostrar. */
function ResetDrawer({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const reset = usePasswordReset();
  const link = reset.data;
  return (
    <Drawer
      title={t('team.resetTitle', { name: member.name })}
      subtitle={member.email}
      busy={reset.isPending}
      onClose={onClose}
      footer={
        link ? (
          <button type="button" className="btn btn--primary" onClick={onClose}>
            {t('team.done')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={reset.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-autofocus
              className="btn btn--primary"
              disabled={reset.isPending}
              onClick={() => reset.mutate(member.id)}
            >
              {reset.isPending ? t('team.resetCreating') : t('team.resetCreate')}
            </button>
          </>
        )
      }
    >
      {link ? (
        <LinkPanel
          kind="reset"
          token={link.token}
          email={member.email}
          expiresAt={link.expiresAt}
        />
      ) : (
        <div className="form-grid">
          <p>{t('team.resetBody', { name: member.name })}</p>
          {reset.error && (
            <p className="form-error" role="alert">
              {describeError(reset.error, i18n)}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}

type Panel =
  | { kind: 'invite'; initial?: { email: string; role: AssignableRole } }
  | { kind: 'reset'; member: TeamMember }
  | { kind: 'deactivate'; member: TeamMember };

/**
 * Equipo (`/admin/team`, solo el dueño): miembros con su rol y estado, invitaciones pendientes y
 * el cupo del plan. Invitar y el enlace de contraseña nueva muestran un enlace de un solo uso
 * para copiar (todavía sin correo).
 */
export function TeamPage() {
  const session = useSession();
  const isOwner = session?.staff.role === 'owner';
  const i18n = useI18n();
  const { t, dateTime } = i18n;
  const { data: tenant } = useTenant();
  const team = useTeam(isOwner);
  const update = useUpdateMember();
  const revoke = useRevokeInvitation();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const brand = brandName(tenant);
  useEffect(() => {
    document.title = t('team.pageTitle', { brand });
  }, [t, brand]);

  if (session && !isOwner) return <Navigate to="/orders" replace />;

  if (team.error && !team.data) {
    return (
      <div className="state state--error" role="alert">
        <span className="state__icon">
          <IconAlert size={28} />
        </span>
        <h1>{t('team.errorTitle')}</h1>
        <p>{describeError(team.error, i18n)}</p>
        <button type="button" className="btn btn--primary" onClick={() => void team.refetch()}>
          <IconRefresh size={18} />
          {t('board.retry')}
        </button>
      </div>
    );
  }
  if (!team.data) {
    return (
      <div className="page" role="status">
        <span className="sr-only">{t('team.loading')}</span>
        <div className="card card--skeleton" aria-hidden="true">
          <span className="skeleton" style={{ width: '40%', height: 22 }} />
          <span className="skeleton" style={{ width: '90%', height: 14 }} />
          <span className="skeleton" style={{ width: '75%', height: 14 }} />
        </div>
      </div>
    );
  }

  const { members, invitations, usage } = team.data;
  const full = usageFull(usage);
  const start = () => {
    setFlash(null);
    setActionError(null);
  };
  const fail = (error: unknown) => setActionError(describeError(error, i18n));

  const changeRole = (member: TeamMember, role: AssignableRole) => {
    start();
    update.mutate(
      { id: member.id, body: { role } },
      { onSuccess: () => setFlash(t('team.roleSaved', { name: member.name })), onError: fail },
    );
  };
  const setActive = (member: TeamMember, isActive: boolean) => {
    start();
    update.mutate(
      { id: member.id, body: { isActive } },
      {
        onSuccess: () => {
          setPanel(null);
          setFlash(t(isActive ? 'team.reactivated' : 'team.deactivated', { name: member.name }));
        },
        onError: (error) => {
          if (isActive) fail(error);
        },
      },
    );
  };
  const revokeInvitation = (invitation: TeamInvitation) => {
    start();
    revoke.mutate(invitation.id, { onSuccess: () => setFlash(t('team.revoked')), onError: fail });
  };

  return (
    <section className="page" aria-labelledby="team-title">
      <header className="page-head">
        <div className="page-head__text">
          <h1 id="team-title" className="page-head__title">
            {t('team.title')}
          </h1>
          <p className="page-head__sub">{t('team.subtitle')}</p>
        </div>
        <div className="page-head__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={full}
            onClick={() => {
              start();
              setPanel({ kind: 'invite' });
            }}
          >
            <IconPlus size={18} />
            {t('team.invite')}
          </button>
        </div>
      </header>

      {flash && (
        <p className="flash" role="status">
          {flash}
        </p>
      )}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      <PlanUsage label={t('team.usageLabel')} usage={usage} />

      <article className="card" aria-labelledby="team-members">
        <div className="card__head">
          <span className="card__icon" aria-hidden="true">
            <IconUsers size={20} />
          </span>
          <h2 id="team-members">{t('team.members')}</h2>
        </div>
        <ul className="team-list">
          {members.map((member) => {
            const editable = !member.isSelf && member.isActive;
            return (
              <li key={member.id} className={`team-row${member.isActive ? '' : ' is-inactive'}`}>
                <span className="team-row__avatar" aria-hidden="true">
                  {initials(member.name)}
                </span>
                <span className="team-row__who">
                  <span className="team-row__name">
                    {member.name}
                    {member.isSelf && <span className="tag tag--muted">{t('team.you')}</span>}
                    {!member.isActive && (
                      <span className="tag tag--danger">{t('team.inactive')}</span>
                    )}
                  </span>
                  <span className="team-row__email">{member.email}</span>
                </span>
                <span className="team-row__role">
                  {editable ? (
                    <select
                      className="field__input"
                      aria-label={t('team.roleAria', { name: member.name })}
                      value={member.role}
                      disabled={update.isPending}
                      onChange={(event) => changeRole(member, event.target.value as AssignableRole)}
                    >
                      {ROLES.filter((role) => role !== 'owner' || member.role === 'owner').map(
                        (role) => (
                          <option key={role} value={role} disabled={role === 'owner'}>
                            {t(`role.${role}`)}
                          </option>
                        ),
                      )}
                    </select>
                  ) : (
                    <span className="tag tag--muted">{t(`role.${member.role}`)}</span>
                  )}
                </span>
                {!member.isSelf && (
                  <span className="team-row__actions">
                    {member.isActive ? (
                      <>
                        {member.role !== 'owner' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => {
                              start();
                              setPanel({ kind: 'reset', member });
                            }}
                          >
                            <IconLock size={16} />
                            {t('team.resetPassword')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--ghost btn--small btn--danger-text"
                          onClick={() => {
                            start();
                            setPanel({ kind: 'deactivate', member });
                          }}
                        >
                          {t('team.deactivate')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={update.isPending}
                        onClick={() => setActive(member, true)}
                      >
                        {t('team.reactivate')}
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <dl className="team-roles">
          {ROLES.map((role) => (
            <div key={role}>
              <dt>{t(`role.${role}`)}</dt>
              <dd>{t(`roleHelp.${role}`)}</dd>
            </div>
          ))}
        </dl>
      </article>

      <article className="card" aria-labelledby="team-invitations">
        <div className="card__head">
          <span className="card__icon" aria-hidden="true">
            <IconPlus size={20} />
          </span>
          <h2 id="team-invitations">{t('team.invitations')}</h2>
        </div>
        {invitations.length === 0 ? (
          <p className="muted">{t('team.noInvitations')}</p>
        ) : (
          <ul className="team-list">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="team-row">
                <span className="team-row__who">
                  <span className="team-row__name">{invitation.email}</span>
                  <span className="team-row__email">
                    {t(`role.${invitation.role}`)} ·{' '}
                    {t('team.expires', { date: dateTime(invitation.expiresAt) })}
                    {invitation.invitedByName &&
                      ` · ${t('team.invitedBy', { name: invitation.invitedByName })}`}
                  </span>
                </span>
                <span className="team-row__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    aria-label={t('team.newLinkAria', { email: invitation.email })}
                    onClick={() => {
                      start();
                      setPanel({
                        kind: 'invite',
                        initial: {
                          email: invitation.email,
                          role: invitation.role === 'manager' ? 'manager' : 'staff',
                        },
                      });
                    }}
                  >
                    {t('team.newLink')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--danger-text"
                    aria-label={t('team.revokeAria', { email: invitation.email })}
                    disabled={revoke.isPending}
                    onClick={() => revokeInvitation(invitation)}
                  >
                    {t('team.revoke')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {panel?.kind === 'invite' && (
        <InviteDrawer initial={panel.initial} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === 'reset' && (
        <ResetDrawer member={panel.member} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === 'deactivate' && (
        <ConfirmDialog
          title={t('team.deactivateTitle', { name: panel.member.name })}
          confirmLabel={t('team.deactivate')}
          cancelLabel={t('common.cancel')}
          pendingLabel={t('common.saving')}
          danger
          pending={update.isPending}
          error={update.error ? describeError(update.error, i18n) : undefined}
          onCancel={() => {
            update.reset();
            setPanel(null);
          }}
          onConfirm={() => setActive(panel.member, false)}
        >
          <p>{t('team.deactivateBody', { name: panel.member.name })}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
