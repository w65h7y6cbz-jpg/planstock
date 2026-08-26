import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addManyToPickList,
  addToPickList,
  checkAll,
  isPickListComplete,
  pendingPhysicalCount,
  pickRoute,
  rackHighlights,
  removePickEntry,
  setPickEntryChecked,
  locationStates,
  splitPickList,
  togglePickEntry,
  type PickEntry,
  type RouteStop,
} from '../lib/picklist';
import type { Item } from '../types';

const STORAGE_KEY = 'planstock.picklist';
const NPL_KEY = 'planstock.picklist_npl';

/**
 * La liste survit à la fermeture du navigateur (localStorage) : une préparation
 * interrompue par une fausse manœuvre se retrouve à la réouverture. Elle n'est
 * jamais enregistrée en base : c'est un brouillon de travail, pas une donnée de
 * stock.
 */
function readStoredEntries(): PickEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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

function readStoredNpl(): string {
  try {
    return localStorage.getItem(NPL_KEY) ?? '';
  } catch {
    return '';
  }
}

export interface PickListState {
  entries: PickEntry[];
  physical: PickEntry[];
  withoutStock: PickEntry[];
  pending: number;
  /** Numéro du bon de préparation en cours, ex. « NPL12345 ». */
  npl: string;
  setNpl: (npl: string) => void;
  complete: boolean;
  locations: Map<string, 'lit' | 'done'>;
  racks: Map<number, { pending: number; done: number }>;
  /** Parcours numéroté tracé sur le plan. */
  route: RouteStop[];
  /** Ligne à faire clignoter : référence déjà présente dans la liste. */
  flashedItemId: number | null;
  add: (item: Item) => boolean;
  addMany: (items: Item[]) => number;
  /** Rafraîchit une ligne après modification ou déplacement de l'article. */
  updateItem: (item: Item) => void;
  toggle: (itemId: number) => void;
  setChecked: (itemId: number, checked: boolean) => void;
  remove: (itemId: number) => void;
  checkEverything: () => void;
  clear: () => void;
}

export function usePickList(): PickListState {
  const [entries, setEntries] = useState<PickEntry[]>(readStoredEntries);
  const [npl, setNpl] = useState<string>(readStoredNpl);
  const [flashedItemId, setFlashedItemId] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Sans stockage local, la liste vaut pour l'affichage en cours.
    }
  }, [entries]);

  useEffect(() => {
    try {
      localStorage.setItem(NPL_KEY, npl);
    } catch {
      // Idem : le numéro de bon reste affiché sans être mémorisé.
    }
  }, [npl]);

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
      complete: isPickListComplete(entries),
      locations: locationStates(entries),
      racks: rackHighlights(entries),
      route: pickRoute(entries),
    };
  }, [entries]);

  const clear = useCallback(() => {
    setEntries([]);
    setNpl('');
  }, []);

  return {
    entries,
    ...derived,
    npl,
    setNpl,
    flashedItemId,
    add,
    addMany,
    updateItem: useCallback(
      (item: Item) =>
        setEntries((current) =>
          current.map((entry) => (entry.item.id === item.id ? { ...entry, item } : entry)),
        ),
      [],
    ),
    toggle: useCallback((itemId) => setEntries((current) => togglePickEntry(current, itemId)), []),
    setChecked: useCallback(
      (itemId, checked) => setEntries((current) => setPickEntryChecked(current, itemId, checked)),
      [],
    ),
    remove: useCallback((itemId) => setEntries((current) => removePickEntry(current, itemId)), []),
    checkEverything: useCallback(() => setEntries((current) => checkAll(current)), []),
    clear,
  };
}
