import { describe, expect, it } from 'vitest';
import {
  addManyToPickList,
  addToPickList,
  checkAll,
  isPickListComplete,
  pendingPhysicalCount,
  pickRoute,
  rackHighlights,
  removePickEntry,
  locationStates,
  splitPickList,
  togglePickEntry,
  type PickEntry,
} from '../picklist';
import type { Item, ItemKind, Location } from '../../types';

let nextId = 1;

/** Étagère `R{rackCode}-E{shelf}` d'un rayonnage. */
function shelf(rackId: number, rackCode: number, shelfIndex: number): Location {
  return {
    kind: 'shelf',
    shelf_id: rackId * 100 + shelfIndex,
    zone_id: null,
    rack_id: rackId,
    rack_code: rackCode,
    rack_kind: 'rack',
    rack_label: `Rayon ${rackCode}`,
    rack_aisle: '',
    rack_style: '',
    shelf_index: shelfIndex,
    side: null,
    customer_id: null,
    customer_name: '',
    site_id: 1,
    site_code: 'optimium',
    site_name: 'Optimium',
    short_code: `E${shelfIndex}`,
    code: `R${String(rackCode).padStart(2, '0')}-E${shelfIndex}`,
  };
}

/** Zone `Z{zoneCode}` (pile au sol, palette…). */
function zone(rackId: number, zoneCode: number, label = `Zone ${zoneCode}`): Location {
  return {
    kind: 'zone',
    shelf_id: null,
    zone_id: rackId,
    rack_id: rackId,
    rack_code: zoneCode,
    rack_kind: 'zone',
    rack_label: label,
    rack_aisle: '',
    rack_style: '',
    shelf_index: null,
    side: null,
    customer_id: null,
    customer_name: '',
    site_id: 1,
    site_code: 'optimium',
    site_name: 'Optimium',
    short_code: `Z${String(zoneCode).padStart(2, '0')}`,
    code: `Z${String(zoneCode).padStart(2, '0')}`,
  };
}

function item(reference: string, kind: ItemKind = 'physical', locations: Location[] = []): Item {
  return {
    id: nextId++,
    reference,
    reference_display: reference,
    designation: `Désignation ${reference}`,
    kind,
    family_code: null,
    family_label: null,
    created_at: '2026-08-26T00:00:00.000Z',
    updated_at: '2026-08-26T00:00:00.000Z',
    locations,
  };
}

const entriesOf = (...items: Item[]): PickEntry[] =>
  items.reduce<PickEntry[]>((entries, current) => addToPickList(entries, current).entries, []);

describe('ajout à la liste de préparation', () => {
  it('ajoute un article physique non coché', () => {
    const arb = item('ARB123', 'physical', [shelf(1, 3, 2)]);
    const result = addToPickList([], arb);

    expect(result.added).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].checked).toBe(false);
  });

  it('coche d’office un article service ou d’un autre site', () => {
    const service = addToPickList([], item('DEPITUC', 'service'));
    const autreSite = addToPickList([], item('AUTRE1', 'other_site'));

    expect(service.entries[0].checked).toBe(true);
    expect(autreSite.entries[0].checked).toBe(true);
  });

  it('ne duplique pas une référence déjà présente et signale la ligne existante', () => {
    const arb = item('ARB123', 'physical', [shelf(1, 3, 2)]);
    const premier = addToPickList([], arb);
    const second = addToPickList(premier.entries, arb);

    expect(second.added).toBe(false);
    expect(second.duplicateOf).toBe(arb.id);
    expect(second.entries).toHaveLength(1);
    expect(second.entries).toBe(premier.entries);
  });

  it('ajoute plusieurs références en un seul appel en ignorant les doublons', () => {
    const a = item('AAA111', 'physical', [shelf(1, 1, 1)]);
    const b = item('BBB222', 'physical', [shelf(1, 1, 2)]);
    const result = addManyToPickList(entriesOf(a), [a, b]);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.entries.map((entry) => entry.item.reference)).toEqual(['AAA111', 'BBB222']);
  });
});

describe('cases à cocher et retrait', () => {
  it('coche, décoche et retire une ligne', () => {
    const arb = item('ARB123', 'physical', [shelf(1, 3, 2)]);
    const entries = entriesOf(arb);

    expect(togglePickEntry(entries, arb.id)[0].checked).toBe(true);
    expect(togglePickEntry(togglePickEntry(entries, arb.id), arb.id)[0].checked).toBe(false);
    expect(removePickEntry(entries, arb.id)).toHaveLength(0);
  });

  it('compte les articles physiques restant à prélever', () => {
    const a = item('AAA111', 'physical', [shelf(1, 1, 1)]);
    const b = item('BBB222', 'physical', [shelf(1, 1, 2)]);
    const service = item('DEPITUC', 'service');
    const entries = entriesOf(a, b, service);

    expect(pendingPhysicalCount(entries)).toBe(2);
    expect(pendingPhysicalCount(togglePickEntry(entries, a.id))).toBe(1);
    expect(pendingPhysicalCount(checkAll(entries))).toBe(0);
  });
});

describe('séparation des articles sans stock physique', () => {
  it('range services et autres sites à part', () => {
    const physique = item('B39VLAT', 'physical', [shelf(1, 1, 3)]);
    const service = item('DEPITUC', 'service');
    const autreSite = item('DUCOS01', 'other_site');
    const { physical, withoutStock } = splitPickList(entriesOf(physique, service, autreSite));

    expect(physical.map((entry) => entry.item.reference)).toEqual(['B39VLAT']);
    expect(withoutStock.map((entry) => entry.item.reference)).toEqual(['DEPITUC', 'DUCOS01']);
  });

  it('n’allume aucun emplacement pour un service', () => {
    const service = item('DEPITUC', 'service');
    expect(locationStates(entriesOf(service)).size).toBe(0);
    expect(rackHighlights(entriesOf(service)).size).toBe(0);
  });
});

describe('éclairage du plan', () => {
  it('allume l’étagère d’un article à prélever, la valide une fois cochée', () => {
    const emplacement = shelf(1, 3, 2);
    const arb = item('ARB123', 'physical', [emplacement]);
    const entries = entriesOf(arb);

    expect(locationStates(entries).get(emplacement.code)).toBe('lit');
    expect(locationStates(togglePickEntry(entries, arb.id)).get(emplacement.code)).toBe('done');
  });

  it('garde une étagère allumée tant qu’un de ses articles reste à prendre', () => {
    const emplacement = shelf(1, 3, 2);
    const a = item('AAA111', 'physical', [emplacement]);
    const b = item('BBB222', 'physical', [emplacement]);
    const entries = togglePickEntry(entriesOf(a, b), a.id);

    expect(entries[0].checked).toBe(true);
    expect(locationStates(entries).get(emplacement.code)).toBe('lit');
    expect(locationStates(checkAll(entries)).get(emplacement.code)).toBe('done');
  });

  it('allume une zone comme un rayonnage', () => {
    const surZone = item('B39VLAT', 'physical', [zone(7, 2, 'Pile ProDesk')]);
    const entries = entriesOf(surZone);

    expect(locationStates(entries).get('Z02')).toBe('lit');
    expect(rackHighlights(entries).get(7)).toEqual({ pending: 1, done: 0 });
    expect(locationStates(togglePickEntry(entries, surZone.id)).get('Z02')).toBe('done');
  });

  it('compte les articles par rayonnage pour le badge de la vue de dessus', () => {
    const a = item('AAA111', 'physical', [shelf(1, 3, 2)]);
    const b = item('BBB222', 'physical', [shelf(1, 3, 1)]);
    const c = item('CCC333', 'physical', [shelf(2, 5, 1)]);
    const entries = togglePickEntry(entriesOf(a, b, c), b.id);

    const highlights = rackHighlights(entries);
    expect(highlights.get(1)).toEqual({ pending: 1, done: 1 });
    expect(highlights.get(2)).toEqual({ pending: 1, done: 0 });
  });
});

describe('parcours de préparation tracé sur le plan', () => {
  it('numérote un arrêt par meuble, dans l’ordre de saisie', () => {
    const a = item('AAA111', 'physical', [shelf(1, 3, 2)]);
    const b = item('BBB222', 'physical', [zone(7, 2)]);
    const c = item('CCC333', 'physical', [shelf(1, 3, 5)]);

    expect(pickRoute(entriesOf(a, b, c))).toEqual([
      { rackId: 1, position: 1, pending: 2, done: 0 },
      { rackId: 7, position: 2, pending: 1, done: 0 },
    ]);
  });

  it('garde son numéro à un arrêt terminé : le tracé ne se renumérote pas', () => {
    const a = item('AAA111', 'physical', [shelf(1, 3, 2)]);
    const b = item('BBB222', 'physical', [shelf(2, 5, 1)]);
    const route = pickRoute(togglePickEntry(entriesOf(a, b), a.id));

    expect(route[0]).toEqual({ rackId: 1, position: 1, pending: 0, done: 1 });
    expect(route[1].position).toBe(2);
  });

  it('ignore les articles sans stock physique', () => {
    const service = item('DEPITUC', 'service');
    const range = item('AAA111', 'physical', [shelf(1, 3, 2)]);

    expect(pickRoute(entriesOf(service, range)).map((stop) => stop.rackId)).toEqual([1]);
  });

  it('déclare la préparation terminée seulement quand tout est coché', () => {
    const a = item('AAA111', 'physical', [shelf(1, 3, 2)]);
    const b = item('BBB222', 'physical', [shelf(1, 3, 3)]);
    const entries = entriesOf(a, b);

    expect(isPickListComplete([])).toBe(false);
    expect(isPickListComplete(entries)).toBe(false);
    expect(isPickListComplete(checkAll(entries))).toBe(true);
  });
});
