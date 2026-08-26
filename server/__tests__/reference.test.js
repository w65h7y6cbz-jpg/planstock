import { describe, expect, it } from 'vitest';
import {
  cleanDisplayReference,
  normalizeReference,
  normalizeReferenceStrict,
} from '../lib/reference.js';
import {
  formatLocationCode,
  formatRackCode,
  formatSlotShortCode,
  parseLocationCode,
} from '../lib/locationCode.js';

describe('normalizeReference', () => {
  it('met en majuscules et retire espaces, tirets, slashs et points', () => {
    expect(normalizeReference('uk707e/l')).toBe('UK707EL');
    expect(normalizeReference('ar-b 123')).toBe('ARB123');
    expect(normalizeReference('b39.vlat')).toBe('B39VLAT');
    expect(normalizeReference('  DEP ITUC  ')).toBe('DEPITUC');
  });

  it('rend la recherche insensible à la façon dont la référence est saisie', () => {
    const variantes = ['UK707E/L', 'uk707el', 'UK-707-E-L', 'uk 707 e/l', 'Uk707E.L'];
    for (const variante of variantes) {
      expect(normalizeReference(variante)).toBe('UK707EL');
    }
  });

  it('tolère les valeurs absentes', () => {
    expect(normalizeReference(null)).toBe('');
    expect(normalizeReference(undefined)).toBe('');
    expect(normalizeReference('')).toBe('');
    expect(normalizeReferenceStrict('   ')).toBeNull();
    expect(normalizeReferenceStrict('a')).toBe('A');
  });

  it('conserve la référence affichée telle que saisie', () => {
    expect(cleanDisplayReference('  UK707E/L ')).toBe('UK707E/L');
  });
});

describe('codes d’emplacement', () => {
  it('formate le rayon sur deux chiffres, étagère et case sans zéro initial', () => {
    expect(formatRackCode(3)).toBe('R03');
    expect(formatRackCode(12)).toBe('R12');
    expect(formatSlotShortCode(2, 4)).toBe('E2-C4');
    expect(formatLocationCode(3, 2, 4)).toBe('R03-E2-C4');
    expect(formatLocationCode(1, 3, 2)).toBe('R01-E3-C2');
  });

  it('relit un code d’emplacement', () => {
    expect(parseLocationCode('R03-E2-C4')).toEqual({ rackCode: 3, shelfIndex: 2, slotIndex: 4 });
    expect(parseLocationCode('r03-e2-c4')).toEqual({ rackCode: 3, shelfIndex: 2, slotIndex: 4 });
    expect(parseLocationCode('R3-E2')).toBeNull();
    expect(parseLocationCode('n’importe quoi')).toBeNull();
  });
});
