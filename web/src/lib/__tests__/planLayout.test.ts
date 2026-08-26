import { describe, expect, it } from 'vitest';
import { layoutRacks } from '../planLayout';

const overlaps = (a: ReturnType<typeof layoutRacks>[number], b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('layoutRacks', () => {
  it('ne place rien pour zéro rayonnage', () => {
    expect(layoutRacks(0)).toEqual([]);
  });

  it('aligne les rectangles en grille', () => {
    const [premier, second] = layoutRacks(2);
    expect(premier.x).toBeLessThan(second.x);
    expect(premier.y).toBe(second.y);
    expect(premier.width).toBe(second.width);
  });

  it('passe à la ligne au-delà de quatre colonnes', () => {
    const geometries = layoutRacks(9);
    const lignes = new Set(geometries.map((geometry) => geometry.y));
    expect(lignes.size).toBeGreaterThan(1);
    expect(geometries[0].y).toBe(geometries[1].y);
    expect(geometries.at(-1)!.y).toBeGreaterThan(geometries[0].y);
  });

  it('garde tous les rectangles dans les limites du plan', () => {
    for (const count of [1, 2, 5, 12, 30]) {
      for (const geometry of layoutRacks(count)) {
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(geometry.y).toBeGreaterThanOrEqual(0);
        expect(geometry.x + geometry.width).toBeLessThanOrEqual(100);
        expect(geometry.y + geometry.height).toBeLessThanOrEqual(100);
        expect(geometry.width).toBeGreaterThan(0);
        expect(geometry.height).toBeGreaterThan(0);
      }
    }
  });

  it('ne fait jamais se chevaucher deux rayonnages', () => {
    for (const count of [2, 4, 7, 16]) {
      const geometries = layoutRacks(count);
      for (let i = 0; i < geometries.length; i += 1) {
        for (let j = i + 1; j < geometries.length; j += 1) {
          expect(overlaps(geometries[i], geometries[j])).toBe(false);
        }
      }
    }
  });
});
