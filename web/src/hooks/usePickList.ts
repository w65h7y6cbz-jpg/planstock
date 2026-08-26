import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addManyToPickList,
  addToPickList,
  checkAll,
  pendingPhysicalCount,
  rackHighlights,
  removePickEntry,
  setPickEntryChecked,
  slotStates,
  splitPickList,
  togglePickEntry,
  type PickEntry,
} from '../lib/picklist';
import type { Item } from '../types';

const STORAGE_KEY = 'planstock.picklist';

/**
 * La liste survit à un rafraîchissement de page (sessionStorage) mais n'est
 * jamais enregistrée en base : c'est un brouillon de préparation, pas une donnée
 * de stock.
 */
function readStoredEntries(): PickEntry[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PickEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        'item' in entry &&
        typeof (entry as PickEntry).item?.id === 'number',
    );
  } catch {
    return [];
  }
}

export interface PickListState {
  entries: PickEntry[];
  physical: PickEntry[];
  withoutStock: PickEntry[];
  pending: number;
  slots: Map<number, 'lit' | 'done'>;
  racks: Map<number, { pending: number; done: number }>;
  /** Ligne à faire clignoter : référence déjà présente dans la liste. */
  flashedItemId: number | null;
  add: (item: Item) => boolean;
  addMany: (items: Item[]) => number;
  toggle: (itemId: number) => void;
  setChecked: (itemId: number, checked: boolean) => void;
  remove: (itemId: number) => void;
  checkEverything: () => void;
  clear: () => void;
}

export function usePickList(): PickListState {
  const [entries, setEntries] = useState<PickEntry[]>(readStoredEntries);
  const [flashedItemId, setFlashedItemId] = useState<number | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Sans stockage de session, la liste vaut pour l'affichage en cours.
    }
  }, [entries]);

  useEffect(() => {
    if (flashedItemId === null) return;
    const timer = setTimeout(() => setFlashedItemId(null), 900);
    return () => clearTimeout(timer);
  }, [flashedItemId]);

  const add = useCallback((item: Item) => {
    let added = false;
    setEntries((current) => {
      const result = addToPickList(current, item);
      added = result.added;
      setFlashedItemId(item.id);
      return result.entries;
    });
    return added;
  }, []);

  const addMany = useCallback((items: Item[]) => {
    let added = 0;
    setEntries((current) => {
      const result = addManyToPickList(current, items);
      added = result.added;
      return result.entries;
    });
    return added;
  }, []);

  const derived = useMemo(() => {
    const { physical, withoutStock } = splitPickList(entries);
    return {
      physical,
      withoutStock,
      pending: pendingPhysicalCount(entries),
      slots: slotStates(entries),
      racks: rackHighlights(entries),
    };
  }, [entries]);

  return {
    entries,
    ...derived,
    flashedItemId,
    add,
    addMany,
    toggle: useCallback((itemId) => setEntries((current) => togglePickEntry(current, itemId)), []),
    setChecked: useCallback(
      (itemId, checked) => setEntries((current) => setPickEntryChecked(current, itemId, checked)),
      [],
    ),
    remove: useCallback((itemId) => setEntries((current) => removePickEntry(current, itemId)), []),
    checkEverything: useCallback(() => setEntries((current) => checkAll(current)), []),
    clear: useCallback(() => setEntries([]), []),
  };
}
