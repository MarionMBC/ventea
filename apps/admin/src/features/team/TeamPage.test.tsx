import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CreatedInvitation, Team } from '@ventea/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { apiError, createFakeApi, json, STAFF_SESSION, type Handler } from '@/test/fixtures';

import { tokenFromHash } from './LinkPages';
import { teamLink } from './LinkPanel';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TOKEN = 'A'.repeat(40) + 'b_-';

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    members: [
      {
        id: STAFF_SESSION.staff.id,
        email: 'owner@chc.test',
        name: 'Marta López',
        role: 'owner',
        isActive: true,
        isSelf: true,
        createdAt: new Date('2026-10-01T12:00:00Z'),
      },
      {
        id: uuid(11),
        email: 'ana@chc.test',
        name: 'Ana Cocina',
        role: 'staff',
        isActive: true,
        isSelf: false,
        createdAt: new Date('2026-10-02T12:00:00Z'),
      },
    ],
    invitations: [],
    usage: { used: 2, max: 3, plan: 'basic', planName: 'Básico' },
    ...overrides,
  };
}

function renderApp(
  path: string,
  {
    role = 'owner',
    team = makeTeam(),
    signedIn = true,
    before,
  }: {
    role?: 'owner' | 'manager' | 'staff';
    team?: Team;
    signedIn?: boolean;
    before?: Handler;
  } = {},
) {
  const state = { team };
  const api = createFakeApi();
  api.setOverride(async (req) => {
    const early = await before?.(req);
    if (early) return early;
    if (req.path === '/api/staff/team' && req.method === 'GET') return json(state.team);
    if (req.path === '/api/staff/team/invitations' && req.method === 'POST') {
      const body = req.body as { email: string; role: 'manager' | 'staff' };
      const created: CreatedInvitation = {
        token: TOKEN,
        expiresAt: new Date('2026-10-12T12:00:00Z'),
        invitation: {
          id: uuid(50),
          email: body.email,
          role: body.role,
          expiresAt: new Date('2026-10-12T12:00:00Z'),
          createdAt: new Date('2026-10-09T12:00:00Z'),
        },
      };
      state.team = { ...state.team, invitations: [created.invitation] };
      return json(created, 201);
    }
    const member = req.path.match(/^\/api\/staff\/team\/members\/([^/]+)$/);
    if (member && req.method === 'PATCH') {
      state.team = {
        ...state.team,
        members: state.team.members.map((m) =>
          m.id === member[1] ? { ...m, ...(req.body as object) } : m,
        ),
      };
      return new Response(null, { status: 204 });
    }
    if (req.path.endsWith('/password-reset') && req.method === 'POST') {
      return json({ token: TOKEN, expiresAt: new Date('2026-10-12T12:00:00Z') }, 201);
    }
    return undefined;
  });
  const session = createSessionStore(null);
  if (signedIn) session.set({ ...STAFF_SESSION, staff: { ...STAFF_SESSION.staff, role } });
  const client = createApiClient({ session, fetch: api.fetch });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  window.history.pushState({}, '', path);
  render(<App services={{ client, session }} queryClient={queryClient} />);
  return { api, state, session };
}

afterEach(() => {
  document.title = '';
  vi.restoreAllMocks();
});

describe('Equipo', () => {
  it('solo el dueño: el resto vuelve a pedidos y no ve el enlace', async () => {
    renderApp('/admin/team', { role: 'manager' });
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull();
  });

  it('lista miembros, el cupo y no deja tocarse a uno mismo', async () => {
    renderApp('/admin/team');
    expect(await screen.findByRole('heading', { level: 1, name: 'Team' })).toBeTruthy();
    expect(screen.getByText('2 of 3 in use · Basic plan')).toBeTruthy();
    const me = screen.getByText('owner@chc.test').closest('li')!;
    expect(within(me).getByText('You')).toBeTruthy();
    expect(within(me).queryByRole('combobox')).toBeNull();
    expect(within(me).queryByRole('button')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Role of Ana Cocina' })).toBeTruthy();
    expect(screen.getByText('No pending invitations.')).toBeTruthy();
  });

  it('invitar: muestra el enlace de un solo uso para copiar (sin correo)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { api } = renderApp('/admin/team');
    fireEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite to your team' });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'nuevo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create invitation' }));
    expect(within(dialog).getByText('Enter a valid email.')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'Nuevo@Example.com' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Manager/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create invitation' }));

    const ready = await screen.findByRole('dialog', {
      name: 'Invitation for nuevo@example.com is ready',
    });
    const link = within(ready).getByLabelText('Single-use link') as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/admin/join#${TOKEN}`);
    expect(within(ready).getByText(/We also email it to nuevo@example.com/)).toBeTruthy();
    fireEvent.click(within(ready).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link.value));
    expect(await within(ready).findByRole('button', { name: 'Link copied' })).toBeTruthy();
    expect(api.calls.find((c) => c.path === '/api/staff/team/invitations')?.body).toEqual({
      email: 'nuevo@example.com',
      role: 'manager',
    });

    fireEvent.click(within(ready).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('nuevo@example.com')).toBeTruthy();
  });

  it('cupo lleno: Invitar deshabilitado y aviso', async () => {
    renderApp('/admin/team', {
      team: makeTeam({ usage: { used: 3, max: 3, plan: 'basic', planName: 'Básico' } }),
    });
    const invite = (await screen.findByRole('button', { name: 'Invite' })) as HTMLButtonElement;
    expect(invite.disabled).toBe(true);
    expect(screen.getByText('You reached your plan’s limit. Upgrade it to add more.')).toBeTruthy();
  });

  it('cambiar el rol avisa que debe volver a entrar', async () => {
    const { api } = renderApp('/admin/team');
    fireEvent.change(await screen.findByRole('combobox', { name: 'Role of Ana Cocina' }), {
      target: { value: 'manager' },
    });
    expect(await screen.findByText('Role updated. Ana Cocina must sign in again.')).toBeTruthy();
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ role: 'manager' });
  });

  it('desactivar pide confirmación; un error de la API se muestra en el diálogo', async () => {
    renderApp('/admin/team', {
      before: (req) =>
        req.method === 'PATCH'
          ? apiError(409, 'La marca no puede quedarse sin dueño activo')
          : undefined,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    const confirm = screen.getByRole('dialog', { name: 'Deactivate Ana Cocina?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
    expect(await within(confirm).findByRole('alert')).toBeTruthy();
  });

  it('enlace de contraseña: confirmar y mostrar el enlace', async () => {
    renderApp('/admin/team');
    fireEvent.click(await screen.findByRole('button', { name: 'Password link' }));
    const dialog = screen.getByRole('dialog', { name: 'New password link for Ana Cocina' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
    const link = (await within(dialog).findByLabelText('Single-use link')) as HTMLInputElement;
    expect(link.value).toBe(`${window.location.origin}/admin/reset-password#${TOKEN}`);
  });
});

describe('Equipo: dueños e invitaciones (review)', () => {
  it('otro dueño: sin enlace de contraseña; invitación con quién la creó', async () => {
    const base = makeTeam();
    renderApp('/admin/team', {
      team: {
        ...base,
        members: [
          ...base.members,
          {
            id: uuid(12),
            email: 'socio@chc.test',
            name: 'Socio Dueño',
            role: 'owner',
            isActive: true,
            isSelf: false,
            createdAt: new Date('2026-10-03T12:00:00Z'),
          },
        ],
        invitations: [
          {
            id: uuid(60),
            email: 'pendiente@chc.test',
            role: 'staff',
            expiresAt: new Date('2026-10-12T12:00:00Z'),
            createdAt: new Date('2026-10-09T12:00:00Z'),
            invitedByName: 'Marta López',
          },
        ],
      },
    });
    const socio = (await screen.findByText('socio@chc.test')).closest('li')!;
    expect(within(socio).queryByRole('button', { name: 'Password link' })).toBeNull();
    expect(within(socio).getByRole('button', { name: 'Deactivate' })).toBeTruthy();
    const ana = screen.getByText('ana@chc.test').closest('li')!;
    expect(within(ana).getByRole('button', { name: 'Password link' })).toBeTruthy();
    expect(screen.getByText(/invited by Marta López/)).toBeTruthy();
  });
});

describe('Enlaces públicos', () => {
  it('lee el token del fragmento', () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash('')).toBe('');
    expect(tokenFromHash('#%E0%A4%A')).toBe('');
    expect(teamLink('invitation', 'x', 'https://a.ventea.tech')).toBe(
      'https://a.ventea.tech/admin/join#x',
    );
  });

  it('aceptar invitación: muestra rol y email, valida y entra', async () => {
    const accept = vi.fn();
    const { session } = renderApp(`/admin/join#${TOKEN}`, {
      signedIn: false,
      before: (req) => {
        if (req.path === '/api/staff/auth/invitation/lookup') {
          return json({
            email: 'nuevo@example.com',
            role: 'manager',
            brandName: 'Carolina Hot Chicken',
            expiresAt: '2026-10-12T12:00:00Z',
          });
        }
        if (req.path === '/api/staff/auth/invitation/accept') {
          accept(req.body);
          return json({
            ...STAFF_SESSION,
            staff: { ...STAFF_SESSION.staff, role: 'manager', name: 'Nuevo' },
          });
        }
        return undefined;
      },
    });
    expect(
      await screen.findByRole('heading', { name: 'Join the Carolina Hot Chicken team' }),
    ).toBeTruthy();
    expect(screen.getByText(/invited as Manager with nuevo@example.com/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'clave-larga-1' } });
    fireEvent.change(screen.getByLabelText('Repeat the password'), {
      target: { value: 'otra-clave-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join and sign in' }));
    expect(screen.getByText('The passwords don’t match.')).toBeTruthy();
    expect(accept).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Repeat the password'), {
      target: { value: 'clave-larga-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Join and sign in' }));
    });
    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith({
        token: TOKEN,
        name: 'Nuevo',
        password: 'clave-larga-1',
      }),
    );
    await waitFor(() => expect(session.get()?.staff.role).toBe('manager'));
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeTruthy();
  });

  it('el token sale de la barra de direcciones tras leerlo', async () => {
    renderApp(`/admin/join#${TOKEN}`, {
      signedIn: false,
      before: (req) =>
        req.path === '/api/staff/auth/invitation/lookup'
          ? json({
              email: 'nuevo@example.com',
              role: 'staff',
              brandName: 'Carolina Hot Chicken',
              expiresAt: '2026-10-12T12:00:00Z',
            })
          : undefined,
    });
    await screen.findByRole('heading', { name: 'Join the Carolina Hot Chicken team' });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/admin/join');
  });

  it('enlace vencido o usado: aviso sin detalle y vuelta al login', async () => {
    renderApp(`/admin/reset-password#${TOKEN}`, {
      signedIn: false,
      before: (req) =>
        req.path === '/api/staff/auth/password-reset/lookup'
          ? apiError(404, 'El enlace no es válido o ya venció.')
          : undefined,
    });
    expect(await screen.findByRole('heading', { name: 'This link doesn’t work' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe(
      '/admin/login',
    );
  });

  it('sin token en el enlace: no llama a la API', async () => {
    const { api } = renderApp('/admin/join', { signedIn: false });
    expect(await screen.findByRole('heading', { name: 'This link doesn’t work' })).toBeTruthy();
    expect(api.calls.some((c) => c.path.includes('/invitation/'))).toBe(false);
  });
});
