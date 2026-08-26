import type { ItemKind, Side } from '../types';

/** Libellés français des valeurs d'énumération, au même endroit pour tous les écrans. */

export const KIND_LABELS: Record<ItemKind, string> = {
  physical: 'Article physique',
  service: 'Service',
  // La valeur en base reste `other_site` ; depuis que les deux locaux sont
  // gérés ici, elle désigne un article connu de SAGE mais rangé ailleurs.
  other_site: 'Hors PlanStock',
};

/** Message affiché en grand à la place du code, pour un article sans emplacement. */
export const KIND_MESSAGES: Record<Exclude<ItemKind, 'physical'>, string> = {
  service: 'Pas de stock physique',
  other_site: 'Rangé hors PlanStock',
};

export const SIDE_LABELS: Record<Side, string> = {
  left: 'à gauche',
  center: 'au centre',
  right: 'à droite',
};

export const SIDE_SHORT: Record<Side, string> = {
  left: 'Gauche',
  center: 'Centre',
  right: 'Droite',
};

export const SIDES: Side[] = ['left', 'center', 'right'];

/** Position relative du côté sur la largeur d'une étagère (0 = gauche, 1 = droite). */
export const SIDE_POSITION: Record<Side, number> = {
  left: 1 / 6,
  center: 1 / 2,
  right: 5 / 6,
};

/**
 * Couleur d'allée. Deux rayonnages de la même allée portent la même couleur,
 * ce qui donne la direction avant même d'avoir lu le code. Sans allée, l'index
 * vaut -1 et le rayonnage reste neutre.
 */
export function aisleTone(aisle: string | null | undefined): number {
  const key = String(aisle ?? '').trim().toUpperCase();
  if (!key) return -1;

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100_000;
  }
  return hash % 8;
}

/** Variable CSS de la couleur d'allée, ou une teinte neutre. */
export function aisleColor(aisle: string | null | undefined, fallback = 'var(--text-faint)'): string {
  const tone = aisleTone(aisle);
  return tone < 0 ? fallback : `var(--aisle-${tone})`;
}
