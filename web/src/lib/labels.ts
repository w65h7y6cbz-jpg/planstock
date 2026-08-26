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

/**
 * Sur une gondole — panneau perforé à broches, servi des deux côtés — « côté »
 * ne veut pas dire gauche ou droite : il désigne la face. Se tromper de face,
 * c'est faire le tour du meuble pour rien, ou repartir bredouille alors que la
 * référence est là. Il n'y a pas de milieu sur un panneau à deux faces.
 */
export const FACE_LABELS: Partial<Record<Side, string>> = {
  left: 'face A',
  right: 'face B',
};

export const FACE_SHORT: Partial<Record<Side, string>> = {
  left: 'Face A',
  right: 'Face B',
};

export const FACES: Side[] = ['left', 'right'];

/** Une gondole porte des rangées de broches, pas des tablettes. */
export const isPegboard = (style: string | null | undefined) => style === 'pegboard';

/** Libellé du côté, selon que le meuble est une gondole ou un rayonnage. */
export const sideLabel = (side: Side, style?: string | null) =>
  (isPegboard(style) ? FACE_LABELS[side] : SIDE_LABELS[side]) ?? SIDE_LABELS[side];

export const sideShort = (side: Side, style?: string | null) =>
  (isPegboard(style) ? FACE_SHORT[side] : SIDE_SHORT[side]) ?? SIDE_SHORT[side];

/** Le mot juste pour une bande : tablette sur un rayonnage, broche sur une gondole. */
export const slotWord = (style?: string | null, plural = false) =>
  isPegboard(style) ? (plural ? 'broches' : 'broche') : plural ? 'étagères' : 'étagère';

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
