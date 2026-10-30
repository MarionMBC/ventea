import { describe, expect, it } from 'vitest';

import { parseWindow } from './OrderSettingsCard';

describe('parseWindow', () => {
  it('empty means no time limit', () => {
    expect(parseWindow('')).toBeNull();
    expect(parseWindow('   ')).toBeNull();
  });

  it('accepts whole minutes from 1 to 1440', () => {
    expect(parseWindow('5')).toBe(5);
    expect(parseWindow(' 30 ')).toBe(30);
    expect(parseWindow('1440')).toBe(1440);
  });

  it('rejects zero, too long, decimals and text', () => {
    for (const bad of ['0', '1441', '2.5', '-3', 'ten', '5 min']) {
      expect(parseWindow(bad)).toBeUndefined();
    }
  });
});
