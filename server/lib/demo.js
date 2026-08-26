import { formatLocationCode } from './locationCode.js';
import { normalizeReference } from './reference.js';
import { recordMovement, syncRackSlots } from './store.js';

/**
 * Jeu de démonstration : un local plausible pour découvrir l'application sans
 * saisir l'inventaire réel. Ne s'installe que sur une base sans rayonnage ni
 * article, pour ne jamais écraser de vraies données.
 */

const RACKS = [
  { code: 1, label: 'Rayon machines', shelves: 4, slots: 5, x: 6, y: 6, width: 42, height: 18 },
  { code: 2, label: 'Rayon imprimantes', shelves: 3, slots: 4, x: 52, y: 6, width: 42, height: 18 },
  { code: 3, label: 'Rayon consommables', shelves: 4, slots: 6, x: 6, y: 30, width: 42, height: 18 },
  { code: 4, label: 'Rayon écrans', shelves: 2, slots: 4, x: 52, y: 30, width: 42, height: 18 },
];

const ITEMS = [
  ['B39VLAT', 'Copieur A3 couleur B39', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E3-C2'],
  ['MX3071', 'Multifonction A3 MX-3071', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E3-C3'],
  ['MX2651', 'Multifonction A3 MX-2651', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E2-C1'],
  ['BP70C31', 'Multifonction A3 BP-70C31', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E1-C4'],
  ['ARB123', 'Imprimante A3 couleur', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E2-C4'],
  ['ARB456', 'Imprimante A4 N/B', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E3-C2'],
  ['ARM207', 'Imprimante A4 couleur', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E1-C1'],
  ['UK707E/L', 'Toner noir UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1-C1'],
  ['UK707E/C', 'Toner cyan UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1-C2'],
  ['UK707E/M', 'Toner magenta UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1-C3'],
  ['UK707E/Y', 'Toner jaune UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1-C4'],
  ['MX561GT', 'Toner MX-561GT', '0450', 'CONSOMMABLE TGC22', 'R03-E2-C1'],
  ['MX560DR', 'Tambour MX-560DR', '0450', 'CONSOMMABLE TGC22', 'R03-E2-C2'],
  ['AR208FS', 'Kit de fusion AR-208', '0450', 'CONSOMMABLE TGC22', 'R03-E3-C5'],
  ['PNE24T', 'Écran 24 pouces', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E2-C1'],
  ['PNE27T', 'Écran 27 pouces', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E2-C2'],
  ['MB14PRO', 'Poste portable 14 pouces', '0510', 'MICRO PORTABLE TGC22', 'R04-E1-C3'],
  ['UPS1500', 'Onduleur 1500 VA', '0710', 'ACCESSOIRE INFORMATIQUE TGC22', 'R01-E1-C1'],
];

const SERVICES = [
  ['DEPITUC', 'Redevance copie privée', '9100', 'REDEVANCE COPIE PRIVEE TGC22'],
  ['ECOPART', 'Éco-participation DEEE', '9110', 'ECOPARTICIPATION TGC22'],
  ['EXTGAR3', 'Extension de garantie 3 ans', '9200', 'EXTENSION DE GARANTIE TGC22'],
];

const OTHER_SITE = [['DUCOS01', 'Copieur stocké à Ducos', '0110', 'COPIEUR MULTIFONCTION TGC22']];

export function demoDataAvailable(db) {
  const racks = db.prepare('SELECT COUNT(*) AS n FROM racks').get().n;
  const items = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  return racks === 0 && items === 0;
}

export function seedDemoData(db, user) {
  const now = new Date().toISOString();

  return db.transaction(() => {
    const slotIds = new Map();

    for (const rack of RACKS) {
      const info = db
        .prepare(
          `INSERT INTO racks (code, label, shelves_count, slots_per_shelf, x, y, width, height, rotation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(
          rack.code,
          rack.label,
          rack.shelves,
          rack.slots,
          rack.x,
          rack.y,
          rack.width,
          rack.height,
          now,
        );

      const created = db.prepare('SELECT * FROM racks WHERE id = ?').get(info.lastInsertRowid);
      syncRackSlots(db, created);

      for (const slot of db
        .prepare('SELECT id, shelf_index, slot_index FROM slots WHERE rack_id = ?')
        .all(created.id)) {
        slotIds.set(formatLocationCode(rack.code, slot.shelf_index, slot.slot_index), slot.id);
      }
    }

    const insertItem = db.prepare(
      `INSERT INTO items (reference, reference_display, designation, kind, family_code, family_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLocation = db.prepare(
      'INSERT INTO item_locations (item_id, slot_id) VALUES (?, ?)',
    );

    let items = 0;
    const create = (reference, designation, familyCode, familyLabel, kind, code) => {
      const slotId = code ? slotIds.get(code) : null;
      if (code && !slotId) throw new Error(`Emplacement de démonstration inconnu : ${code}`);

      const info = insertItem.run(
        normalizeReference(reference),
        reference,
        designation,
        kind,
        familyCode,
        familyLabel,
        now,
        now,
      );
      const id = Number(info.lastInsertRowid);
      if (slotId) insertLocation.run(id, slotId);

      recordMovement(db, {
        item: { id, reference: normalizeReference(reference), designation },
        user,
        action: 'create',
        toSlot: slotId ? { slot_id: slotId, code } : null,
      });
      items += 1;
    };

    for (const [reference, designation, familyCode, familyLabel, code] of ITEMS) {
      create(reference, designation, familyCode, familyLabel, 'physical', code);
    }
    for (const [reference, designation, familyCode, familyLabel] of SERVICES) {
      create(reference, designation, familyCode, familyLabel, 'service', null);
    }
    for (const [reference, designation, familyCode, familyLabel] of OTHER_SITE) {
      create(reference, designation, familyCode, familyLabel, 'other_site', null);
    }

    return { racks: RACKS.length, items };
  })();
}
