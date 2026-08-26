import { formatShelfCode, formatZoneCode } from './locationCode.js';
import { normalizeReference } from './reference.js';
import { recordMovement, syncRackShelves } from './store.js';

/**
 * Jeu de démonstration : un local plausible pour découvrir l'application sans
 * saisir l'inventaire réel. Ne s'installe que sur une base sans emplacement ni
 * article, pour ne jamais écraser de vraies données.
 */

const RACKS = [
  { code: 1, label: 'Rayon machines', aisle: 'Allée A', shelves: 5, x: 6, y: 8, width: 38, height: 9 },
  { code: 2, label: 'Rayon imprimantes', aisle: 'Allée A', shelves: 5, x: 6, y: 17, width: 38, height: 9 },
  { code: 3, label: 'Rayon consommables', aisle: 'Allée B', shelves: 6, x: 6, y: 34, width: 38, height: 9 },
  { code: 4, label: 'Rayon écrans', aisle: 'Allée B', shelves: 4, x: 6, y: 43, width: 38, height: 9 },
];

const ZONES = [
  { code: 1, label: 'Palette réception', x: 56, y: 8, width: 22, height: 12 },
  { code: 2, label: 'Pile ProDesk', x: 56, y: 24, width: 22, height: 12 },
  { code: 3, label: 'Cage grillagée', x: 56, y: 40, width: 22, height: 14 },
];

const ITEMS = [
  ['MX3071', 'Multifonction A3 MX-3071', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E1'],
  ['MX2651', 'Multifonction A3 MX-2651', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E2'],
  ['BP70C31', 'Multifonction A3 BP-70C31', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E2'],
  ['BP20C25', 'Multifonction A3 BP-20C25', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E4'],
  ['ARB123', 'Imprimante A3 couleur', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E2'],
  ['ARB456', 'Imprimante A4 N/B', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E2'],
  ['ARM207', 'Imprimante A4 couleur', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E1'],
  ['ARP350', 'Imprimante A3 N/B', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E5'],
  ['UK707E/L', 'Toner noir UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1'],
  ['UK707E/C', 'Toner cyan UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1'],
  ['UK707E/M', 'Toner magenta UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1'],
  ['UK707E/Y', 'Toner jaune UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1'],
  ['MX561GT', 'Toner MX-561GT', '0450', 'CONSOMMABLE TGC22', 'R03-E2'],
  ['MX560DR', 'Tambour MX-560DR', '0450', 'CONSOMMABLE TGC22', 'R03-E2'],
  ['AR208FS', 'Kit de fusion AR-208', '0450', 'CONSOMMABLE TGC22', 'R03-E6'],
  ['PNE24T', 'Écran 24 pouces', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E1'],
  ['PNE27T', 'Écran 27 pouces', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E1'],
  ['UPS1500', 'Onduleur 1500 VA', '0710', 'ACCESSOIRE INFORMATIQUE TGC22', 'R04-E4'],
  // Articles posés directement sur une zone, sans étagère.
  ['B39VLAT', 'Copieur A3 couleur B39', '0110', 'COPIEUR MULTIFONCTION TGC22', 'Z02'],
  ['PRODESK4', 'Poste fixe ProDesk 400', '0520', 'MICRO FIXE TGC22', 'Z02'],
  ['MB14PRO', 'Poste portable 14 pouces', '0510', 'MICRO PORTABLE TGC22', 'Z03'],
  ['CARTON50', 'Carton de rames A4 (×5)', '0810', 'PAPIER TGC22', 'Z01'],
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
    const insertRack = db.prepare(
      `INSERT INTO racks (code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    );

    // Code d'emplacement → { shelf_id } ou { zone_id }
    const targets = new Map();

    for (const rack of RACKS) {
      const info = insertRack.run(
        rack.code,
        'rack',
        rack.label,
        rack.aisle,
        rack.shelves,
        rack.x,
        rack.y,
        rack.width,
        rack.height,
        now,
      );
      const created = db.prepare('SELECT * FROM racks WHERE id = ?').get(info.lastInsertRowid);
      syncRackShelves(db, created);

      for (const shelf of db
        .prepare('SELECT id, shelf_index FROM shelves WHERE rack_id = ?')
        .all(created.id)) {
        targets.set(formatShelfCode(rack.code, shelf.shelf_index), {
          shelf_id: shelf.id,
          zone_id: null,
        });
      }
    }

    for (const zone of ZONES) {
      const info = insertRack.run(
        zone.code,
        'zone',
        zone.label,
        '',
        0,
        zone.x,
        zone.y,
        zone.width,
        zone.height,
        now,
      );
      targets.set(formatZoneCode(zone.code), {
        shelf_id: null,
        zone_id: Number(info.lastInsertRowid),
      });
    }

    const insertItem = db.prepare(
      `INSERT INTO items (reference, reference_display, designation, kind, family_code, family_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLocation = db.prepare(
      'INSERT INTO item_locations (item_id, shelf_id, zone_id) VALUES (?, ?, ?)',
    );

    let items = 0;
    const create = (reference, designation, familyCode, familyLabel, kind, code) => {
      const target = code ? targets.get(code) : null;
      if (code && !target) throw new Error(`Emplacement de démonstration inconnu : ${code}`);

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
      if (target) insertLocation.run(id, target.shelf_id, target.zone_id);

      recordMovement(db, {
        item: { id, reference: normalizeReference(reference), designation },
        user,
        action: 'create',
        to: code ? { code } : null,
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

    return { racks: RACKS.length, zones: ZONES.length, items };
  })();
}
