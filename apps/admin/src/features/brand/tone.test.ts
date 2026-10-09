import { filledToneHex } from '@ventea/shared';
import { describe, expect, it } from 'vitest';

describe('tono de superficies rellenas (regla compartida con la app)', () => {
  it('oscurece hasta 20 % para texto blanco; si no alcanza, texto oscuro', () => {
    expect(filledToneHex('#e23b2e')).toEqual({ fill: '#d9392c', on: '#ffffff' });
    expect(filledToneHex('#1d4ed8')).toEqual({ fill: '#1d4ed8', on: '#ffffff' });
    expect(filledToneHex('#ffd400')).toEqual({ fill: '#ffd400', on: '#120f0e' });
    expect(filledToneHex('rojo')).toBeNull();
  });
});
