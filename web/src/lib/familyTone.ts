/**
 * Teinte d'une pastille d'article, dérivée de sa famille Sage.
 *
 * Deux articles de la même famille portent la même couleur : dans une étagère
 * qui contient dix références, les toners se repèrent d'un coup d'œil parmi les
 * imprimantes. La couleur n'est qu'un repère visuel — l'information reste la
 * référence et l'emplacement.
 */

export const FAMILY_TONE_COUNT = 8;

/** `'0450'` → `3` (stable, réparti). `null` → `-1`, pastille neutre. */
export function familyTone(familyCode: string | null | undefined): number {
  if (!familyCode) return -1;
  let hash = 0;
  for (const char of familyCode.trim().toUpperCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100_000;
  }
  return hash % FAMILY_TONE_COUNT;
}
