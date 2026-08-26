import { describe, expect, it } from 'vitest';
import { isSearchable, normalizeReference } from '../reference';

describe('normalizeReference (front)', () => {
  it('applique la même règle que le serveur', () => {
    expect(normalizeReference('uk707e/l')).toBe('UK707EL');
    expect(normalizeReference('ar-b 123')).toBe('ARB123');
    expect(normalizeReference('b39.vlat')).toBe('B39VLAT');
    expect(normalizeReference('  DEP ITUC  ')).toBe('DEPITUC');
  });

  it('rend équivalentes toutes les façons de saisir une même référence', () => {
    const variantes = ['UK707E/L', 'uk707el', 'UK-707-E-L', 'uk 707 e/l', 'Uk707E.L'];
    const normalisees = new Set(variantes.map(normalizeReference));
    expect([...normalisees]).toEqual(['UK707EL']);
  });

  it('tolère les valeurs absentes', () => {
    expect(normalizeReference(null)).toBe('');
    expect(normalizeReference(undefined)).toBe('');
    expect(isSearchable('   ')).toBe(false);
    expect(isSearchable('-')).toBe(false);
    expect(isSearchable('a')).toBe(true);
  });
});
