import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, createQueryClient } from '@/app/App';
import { createApiClient } from '@/lib/api';
import { createSessionStore } from '@/lib/session';
import { createFakeApi, makeOrder, STAFF_SESSION } from '@/test/fixtures';

/** AudioContext falso: arranca suspendido, como tras recargar sin gesto (autoplay). */
class FakeAudioContext extends EventTarget {
  state: AudioContextState = 'suspended';
  async resume() {
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sonido bloqueado por el navegador', () => {
  it('con el sonido activado y el audio suspendido avisa «Toca para activar el sonido»', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    window.localStorage.setItem('ventea.admin.sound', 'on');
    const api = createFakeApi([makeOrder()]);
    const session = createSessionStore(null);
    session.set(STAFF_SESSION);
    const queryClient = createQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    window.history.pushState({}, '', '/admin/orders');
    render(
      <App
        services={{ client: createApiClient({ session, fetch: api.fetch }), session }}
        queryClient={queryClient}
      />,
    );

    const unlock = await screen.findByRole('button', { name: 'Toca para activar el sonido' });
    expect(screen.getByRole('button', { name: 'Sonido: activado' })).toBeTruthy();
    fireEvent.click(unlock);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Toca para activar el sonido' })).toBeNull(),
    );
  });
});
