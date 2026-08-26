import type { Item } from '../types';

/**
 * Liste de préparation : logique pure, sans React ni appel réseau.
 *
 * Règles du bon de préparation :
 * - une référence déjà présente n'est jamais dupliquée ;
 * - les articles physiques allument leur emplacement sur le plan, et passent en
 *   « validé » une fois cochés ;
 * - les articles Service ou Autre site n'ont pas d'existence physique : ils sont
 *   rangés à part, cochés d'office, et n'allument jamais rien.
 */

export interface PickEntry {
  item: Item;
  checked: boolean;
}

/** Un article Service ou Autre site est coché d'office : rien à aller chercher. */
export function isPhysical(item: Item): boolean {
  return item.kind === 'physical';
}

export interface AddResult {
  entries: PickEntry[];
  /** `false` si la référence était déjà dans la liste. */
  added: boolean;
  /** Référence de la ligne à faire clignoter en cas de doublon. */
  duplicateOf: number | null;
}

export function addToPickList(entries: PickEntry[], item: Item): AddResult {
  const existing = entries.find((entry) => entry.item.id === item.id);
  if (existing) {
    return { entries, added: false, duplicateOf: item.id };
  }
  return {
    entries: [...entries, { item, checked: !isPhysical(item) }],
    added: true,
    duplicateOf: null,
  };
}

/**
 * Ajoute plusieurs références en une seule fois.
 * Prévu pour l'import d'un bon de préparation (hors MVP) : l'appelant n'a qu'un
 * seul appel à faire, et les doublons sont ignorés silencieusement.
 */
export function addManyToPickList(
  entries: PickEntry[],
  items: Item[],
): { entries: PickEntry[]; added: number; skipped: number } {
  let current = entries;
  let added = 0;

  for (const item of items) {
    const result = addToPickList(current, item);
    current = result.entries;
    if (result.added) added += 1;
  }

  return { entries: current, added, skipped: items.length - added };
}

export function setPickEntryChecked(
  entries: PickEntry[],
  itemId: number,
  checked: boolean,
): PickEntry[] {
  return entries.map((entry) => (entry.item.id === itemId ? { ...entry, checked } : entry));
}

export function togglePickEntry(entries: PickEntry[], itemId: number): PickEntry[] {
  return entries.map((entry) =>
    entry.item.id === itemId ? { ...entry, checked: !entry.checked } : entry,
  );
}

export function removePickEntry(entries: PickEntry[], itemId: number): PickEntry[] {
  return entries.filter((entry) => entry.item.id !== itemId);
}

export function checkAll(entries: PickEntry[]): PickEntry[] {
  return entries.map((entry) => ({ ...entry, checked: true }));
}

/** Sépare les articles à aller chercher de ceux sans stock physique. */
export function splitPickList(entries: PickEntry[]): {
  physical: PickEntry[];
  withoutStock: PickEntry[];
} {
  return {
    physical: entries.filter((entry) => isPhysical(entry.item)),
    withoutStock: entries.filter((entry) => !isPhysical(entry.item)),
  };
}

/** Nombre d'articles physiques restant à prélever (une confirmation les protège). */
export function pendingPhysicalCount(entries: PickEntry[]): number {
  return entries.filter((entry) => isPhysical(entry.item) && !entry.checked).length;
}

export type SlotState = 'lit' | 'done';

/**
 * État de chaque case concernée par la liste : « allumé » tant qu'un article
 * reste à prélever, « validé » quand tous ceux de la case sont cochés.
 */
export function slotStates(entries: PickEntry[]): Map<number, SlotState> {
  const states = new Map<number, SlotState>();

  for (const entry of entries) {
    if (!isPhysical(entry.item)) continue;
    for (const location of entry.item.locations) {
      const next: SlotState = entry.checked ? 'done' : 'lit';
      // Une case reste allumée tant qu'au moins un de ses articles est à prendre.
      if (states.get(location.slot_id) === 'lit') continue;
      states.set(location.slot_id, next);
    }
  }
  return states;
}

export interface RackHighlight {
  /** Articles restant à prélever dans ce rayonnage. */
  pending: number;
  /** Articles déjà cochés. */
  done: number;
}

/** Rayonnages à allumer sur la vue de dessus, avec le compte de leur badge. */
export function rackHighlights(entries: PickEntry[]): Map<number, RackHighlight> {
  const highlights = new Map<number, RackHighlight>();

  for (const entry of entries) {
    if (!isPhysical(entry.item)) continue;
    // Le MVP n'affiche que le premier emplacement d'un article.
    const location = entry.item.locations[0];
    if (!location) continue;

    const current = highlights.get(location.rack_id) ?? { pending: 0, done: 0 };
    if (entry.checked) current.done += 1;
    else current.pending += 1;
    highlights.set(location.rack_id, current);
  }
  return highlights;
}
