import { describe, expect, it } from 'vitest';
import { SIDE_POSITION, aisleColor, aisleTone } from '../labels';

describe('couleur d’allée', () => {
  it('donne la même teinte à deux rayonnages de la même allée', () => {
    expect(aisleTone('Allée A')).toBe(aisleTone('allée a'));
    expect(aisleTone('Allée A')).toBe(aisleTone('  Allée A  '));
  });

  it('distingue deux allées différentes', () => {
    expect(aisleTone('Allée A')).not.toBe(aisleTone('Allée B'));
  });

  it('reste dans les huit teintes disponibles', () => {
    for (const name of ['A', 'B', 'C', 'Allée 1', 'Quai', 'Réserve', 'Fond', 'Entrée', 'Zone X']) {
      const tone = aisleTone(name);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThanOrEqual(7);
    }
  });

  it('laisse un rayonnage sans allée en teinte neutre', () => {
    expect(aisleTone('')).toBe(-1);
    expect(aisleTone(null)).toBe(-1);
    expect(aisleColor(null)).toBe('var(--text-faint)');
    expect(aisleColor('Allée A')).toMatch(/^var\(--aisle-[0-7]\)$/);
  });
});

describe('position du côté sur une étagère', () => {
  it('range gauche, centre et droite dans cet ordre, sans sortir de la tablette', () => {
    expect(SIDE_POSITION.left).toBeLessThan(SIDE_POSITION.center);
    expect(SIDE_POSITION.center).toBeLessThan(SIDE_POSITION.right);
    expect(SIDE_POSITION.left).toBeGreaterThan(0);
    expect(SIDE_POSITION.right).toBeLessThan(1);
  });
});
