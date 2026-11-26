import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AuthValue } from '../auth/authContext';
import { AuthContext } from '../auth/authContext';
import { ApiError } from '../../api/client';
import { ProfileScreen } from './ProfileScreen';

/* No network: the profile's reads (`/api/me`, tenant, points) never answer. */
const renderProfile = (
  signOut: AuthValue['signOut'],
  onSignedOut = vi.fn(),
  deleteAccount: AuthValue['deleteAccount'] = vi.fn(),
  onAccountDeleted = vi.fn(),
) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
  const auth: AuthValue = {
    customer: {
      id: 'c-1',
      email: 'ana@example.test',
      firstName: 'Ana',
      lastName: null,
      phone: null,
    },
    isAuthenticated: true,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut,
    deleteAccount,
    updateCustomer: vi.fn(),
  };
  render(
    <AuthContext.Provider value={auth}>
      <ProfileScreen onSignedOut={onSignedOut} onAccountDeleted={onAccountDeleted} />
    </AuthContext.Provider>,
  );
  return { onSignedOut, onAccountDeleted };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfileScreen sign-out', () => {
  test('shows a busy, disabled row while the device is forgotten (up to ~3 s)', async () => {
    let finish: () => void = () => undefined;
    const signOut = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { onSignedOut } = renderProfile(signOut);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    const row = screen.getByRole('button', { name: /signing out/i });
    expect(row).toHaveProperty('disabled', true);
    expect(row.getAttribute('aria-busy')).toBe('true');
    expect(row.querySelector('.vt-spinner')).not.toBeNull();

    fireEvent.click(row); // a second tap does not start a second clean-up
    expect(signOut).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileScreen account deletion', () => {
  test('asks first, deletes on confirmation and reports back', async () => {
    const deleteAccount = vi.fn(() => Promise.resolve());
    const { onAccountDeleted } = renderProfile(vi.fn(), vi.fn(), deleteAccount);

    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByText('Delete your account?')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(onAccountDeleted).toHaveBeenCalledTimes(1);
  });

  test('an order in progress (409) is explained and nothing is reported', async () => {
    const deleteAccount = vi.fn(() => Promise.reject(new ApiError(409, 'conflict')));
    const { onAccountDeleted } = renderProfile(vi.fn(), vi.fn(), deleteAccount);

    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
    });
    expect(screen.getByText(/you have an order in progress/i)).toBeInTheDocument();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});
