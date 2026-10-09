import { describe, expect, test } from 'vitest';
import { safeRedirect } from './authContext';

describe('safeRedirect', () => {
  test.each([
    '/\\evil.example',
    '/\\/evil.example',
    '/.//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    '//evil.com',
    'https://evil.com',
    'http:evil.com',
    '/\t/evil.com',
    'javascript:alert(1)',
    '',
  ])('rejects %j', (value) => {
    expect(safeRedirect(value)).toBe('/');
  });

  test('keeps same-app paths with their query', () => {
    expect(safeRedirect('/checkout?x=1')).toBe('/checkout?x=1');
    expect(safeRedirect('/orders/abc')).toBe('/orders/abc');
  });

  test('an encoded backslash stays a path inside the app', () => {
    expect(safeRedirect('/%5Cevil.example')).toBe('/%5Cevil.example');
  });

  test('missing value uses the fallback', () => {
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined, '/profile')).toBe('/profile');
  });
});
