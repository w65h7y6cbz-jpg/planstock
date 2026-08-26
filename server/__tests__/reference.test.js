import { describe, expect, it } from 'vitest';
import {
  cleanDisplayReference,
  normalizeReference,
  normalizeReferenceStrict,
} from '../lib/reference.js';
import {
  formatRackCode,
  formatShelfCode,
  formatShelfShortCode,
  formatZoneCode,
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
  it('formate une étagère de rayonnage', () => {
    expect(formatRackCode(3)).toBe('R03');
    expect(formatRackCode(12)).toBe('R12');
    expect(formatShelfShortCode(2)).toBe('E2');
    expect(formatShelfCode(3, 2)).toBe('R03-E2');
    expect(formatShelfCode(1, 5)).toBe('R01-E5');
  });

  it('formate une zone', () => {
    expect(formatZoneCode(1)).toBe('Z01');
    expect(formatZoneCode(12)).toBe('Z12');
    expect(formatRackCode(2, 'zone')).toBe('Z02');
  });

  it('relit un code d’emplacement', () => {
    expect(parseLocationCode('R03-E2')).toEqual({ kind: 'rack', rackCode: 3, shelfIndex: 2 });
    expect(parseLocationCode('r03-e2')).toEqual({ kind: 'rack', rackCode: 3, shelfIndex: 2 });
    expect(parseLocationCode('Z02')).toEqual({ kind: 'zone', rackCode: 2, shelfIndex: null });
    // L'ancien format avec case n'est plus valide.
    expect(parseLocationCode('R03-E2-C4')).toBeNull();
    expect(parseLocationCode('n’importe quoi')).toBeNull();
  });
});
