import { describe, expect, it } from 'vitest';

import { centsToInput, currencySymbol, parseMoneyInput } from './money';
import { moveBefore, moveId, moveIndex, reorderBody, sortByIds } from './reorder';

describe('precios', () => {
  it('texto → centavos con punto o coma decimal y separadores de miles', () => {
    expect(parseMoneyInput('12.50')).toBe(1250);
    expect(parseMoneyInput('12,5')).toBe(1250);
    expect(parseMoneyInput(' 12 ')).toBe(1200);
    expect(parseMoneyInput('1,250')).toBe(125000);
    expect(parseMoneyInput('1,250.75')).toBe(125075);
    expect(parseMoneyInput('1.250,75')).toBe(125075);
    expect(parseMoneyInput('0.05')).toBe(5);
    expect(parseMoneyInput('.5')).toBe(50);
  });

  it('rechaza lo que no es un monto', () => {
    for (const bad of ['', 'abc', '12.345', '-3', '1e3', '$12', '12..5', '1234567890']) {
      expect(parseMoneyInput(bad), bad).toBeNull();
    }
    expect(parseMoneyInput('-0.50', { allowNegative: true })).toBe(-50);
  });

  it('centavos → campo', () => {
    expect(centsToInput(1250)).toBe('12.50');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(-150)).toBe('-1.50');
    expect(centsToInput(null)).toBe('');
  });

  it('símbolo de la moneda, o el código si Intl no la conoce', () => {
    expect(currencySymbol('USD', 'en-US')).toBe('$');
    expect(currencySymbol('HNL', 'es-HN')).toBe('L');
    expect(currencySymbol('XX', 'en-US')).toBe('XX');
  });
});

describe('reorden', () => {
  it('mueve por índice, por delta y antes de otro', () => {
    expect(moveIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveIndex(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('cuerpo del PATCH y orden local', () => {
    expect(reorderBody(['x', 'y'])).toEqual({
      items: [
        { id: 'x', sortOrder: 0 },
        { id: 'y', sortOrder: 1 },
      ],
    });
    expect(sortByIds([{ id: 'a' }, { id: 'b' }, { id: 'z' }], ['b', 'a'])).toEqual([
      { id: 'b' },
      { id: 'a' },
      { id: 'z' },
    ]);
  });
});
