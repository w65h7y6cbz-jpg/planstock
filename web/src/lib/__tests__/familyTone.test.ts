import { describe, expect, it } from 'vitest';
import { FAMILY_TONE_COUNT, familyTone } from '../familyTone';

describe('familyTone', () => {
  it('donne la même teinte à deux articles de la même famille', () => {
    expect(familyTone('0450')).toBe(familyTone('0450'));
    expect(familyTone(' 0450 ')).toBe(familyTone('0450'));
  });

  it('reste dans la palette disponible', () => {
    for (const code of ['0110', '0310', '0450', '0510', '0620', '0710', '9100', '9200', 'ABC']) {
      const tone = familyTone(code);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(FAMILY_TONE_COUNT);
    }
  });

  it('rend une pastille neutre sans famille', () => {
    expect(familyTone(null)).toBe(-1);
    expect(familyTone(undefined)).toBe(-1);
    expect(familyTone('')).toBe(-1);
  });

  it('sépare visuellement les familles courantes du local', () => {
    // Les familles réellement utilisées ne doivent pas se retrouver toutes
    // sur la même teinte, sinon la couleur n'apporte rien.
    const familles = ['0110', '0310', '0450', '0510', '0620', '0710'];
    const teintes = new Set(familles.map(familyTone));
    expect(teintes.size).toBeGreaterThanOrEqual(4);
  });
});
