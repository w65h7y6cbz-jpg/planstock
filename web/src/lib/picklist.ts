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

export type LocationState = 'lit' | 'done';

/**
 * État de chaque emplacement concerné par la liste, indexé par son code
 * (`R03-E2` ou `Z02`) : « allumé » tant qu'un article reste à prélever,
 * « validé » quand tous ceux de l'emplacement sont cochés.
 */
export function locationStates(entries: PickEntry[]): Map<string, LocationState> {
  const states = new Map<string, LocationState>();

  for (const entry of entries) {
    if (!isPhysical(entry.item)) continue;
    for (const location of entry.item.locations) {
      const next: LocationState = entry.checked ? 'done' : 'lit';
      // Un emplacement reste allumé tant qu'un de ses articles est à prendre.
      if (states.get(location.code) === 'lit') continue;
      states.set(location.code, next);
    }
  }
  return states;
}

export interface RackHighlight {
  /** Articles restant à prélever dans ce rayonnage ou cette zone. */
  pending: number;
  /** Articles déjà cochés. */
  done: number;
}

/** Rayonnages et zones à allumer sur la vue de dessus, avec le compte du badge. */
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
