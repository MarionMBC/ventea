import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  // jsdom no trae sendBeacon: un doble que acepta todo. Los tests del embudo lo leen.
  Object.defineProperty(window.navigator, 'sendBeacon', {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  });
});

// Sin `globals: true`, Testing Library no desmonta solo entre tests.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
