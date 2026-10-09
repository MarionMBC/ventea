import { describe, expect, test } from 'vitest';
import { memoryStorage } from '../api/storage';
import { BrandConfigError, parseBrandConfig } from './brandConfig';
import { migrateLegacyStorage, runLegacyMigration } from './legacyStorage';

const target = (name: string) => `ventea.carolina-hot-chicken.${name}`;

describe('legacy storage migration', () => {
  test('moves the previous app keys once and removes them', () => {
    const storage = memoryStorage();
    storage.setItem('chc.session', '{"accessToken":"a"}');
    storage.setItem('chc.favourites', '["x"]');
    storage.setItem('chc.other', 'kept');

    expect(migrateLegacyStorage(storage, 'chc.', target)).toEqual(['session', 'favourites']);
    expect(storage.getItem(target('session'))).toBe('{"accessToken":"a"}');
    expect(storage.getItem(target('favourites'))).toBe('["x"]');
    expect(storage.getItem('chc.session')).toBeNull();
    expect(storage.getItem('chc.other')).toBe('kept');
    expect(migrateLegacyStorage(storage, 'chc.', target)).toEqual([]);
  });

  test('never overwrites a newer value under the template key', () => {
    const storage = memoryStorage();
    storage.setItem('chc.session', 'old');
    storage.setItem(target('session'), 'new');
    expect(migrateLegacyStorage(storage, 'chc.', target)).toEqual([]);
    expect(storage.getItem(target('session'))).toBe('new');
    expect(storage.getItem('chc.session')).toBeNull();
  });

  test('does nothing without a declared prefix or storage', () => {
    const storage = memoryStorage();
    storage.setItem('chc.session', 'old');
    expect(migrateLegacyStorage(storage, undefined, target)).toEqual([]);
    expect(migrateLegacyStorage(storage, 'ventea.', target)).toEqual([]);
    expect(migrateLegacyStorage(null, 'chc.', target)).toEqual([]);
    expect(storage.getItem('chc.session')).toBe('old');
  });

  test('only the native app migrates; a web preview leaves chc.* alone', () => {
    const storage = memoryStorage();
    storage.setItem('chc.session', 'old');
    expect(runLegacyMigration(false, storage, 'chc.', target)).toEqual([]);
    expect(storage.getItem('chc.session')).toBe('old');
    expect(runLegacyMigration(true, storage, 'chc.', target)).toEqual(['session']);
  });

  test('brand file accepts a short prefix ending in a dot', () => {
    const base = {
      tenantSlug: 'carolina-hot-chicken',
      apiUrl: 'https://api.ventea.tech',
      appName: 'Carolina Hot Chicken',
      bundleId: 'com.carolinahotchicken.app',
      colors: { primary: '#E23B2E' },
    };
    expect(parseBrandConfig({ ...base, legacyStoragePrefix: 'chc.' }).legacyStoragePrefix).toBe(
      'chc.',
    );
    expect(parseBrandConfig(base)).not.toHaveProperty('legacyStoragePrefix');
    expect(() => parseBrandConfig({ ...base, legacyStoragePrefix: 'chc' })).toThrow(
      BrandConfigError,
    );
  });
});
