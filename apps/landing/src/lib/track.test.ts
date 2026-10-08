import { afterEach, describe, expect, it, vi } from 'vitest';

import { beaconEvents } from '@/test/fixtures';

import { track, trackOnce } from './track';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('track (embudo)', () => {
  it('manda solo el tipo de evento por sendBeacon', async () => {
    track('cta_click');
    expect(await beaconEvents()).toEqual(['cta_click']);
  });

  it('sin sendBeacon (o si lo rechaza) usa fetch keepalive sin credenciales', () => {
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: undefined });
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    track('visit');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/platform/analytics/event');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' });
    expect(JSON.parse(String(init.body))).toEqual({ event: 'visit' });
  });

  it('nunca lanza: ni con la red caída ni con sendBeacon roto', async () => {
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: () => {
        throw new Error('boom');
      },
    });
    expect(() => track('visit')).not.toThrow();
    Object.defineProperty(window.navigator, 'sendBeacon', { configurable: true, value: undefined });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(() => track('visit')).not.toThrow();
    await Promise.resolve();
  });

  it('trackOnce: una vez por pestaña', async () => {
    trackOnce('signup_start');
    trackOnce('signup_start');
    trackOnce('signup_step_2');
    expect(await beaconEvents()).toEqual(['signup_start', 'signup_step_2']);
  });
});
