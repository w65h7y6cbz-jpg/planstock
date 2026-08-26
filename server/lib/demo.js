import { formatShelfCode, formatZoneCode } from './locationCode.js';
import { normalizeReference } from './reference.js';
import { recordMovement, syncRackShelves } from './store.js';

/**
 * Jeu de démonstration : deux locaux plausibles pour découvrir l'application
 * sans saisir l'inventaire réel. Ne s'installe que sur une base sans
 * emplacement ni article, pour ne jamais écraser de vraies données.
 *
 * Les références restent uniques d'un local à l'autre : un article n'a qu'un
 * seul emplacement, il ne peut pas être rangé dans les deux.
 */

const OPTIMIUM = {
  site: 'optimium',
  racks: [
    { code: 1, label: 'Rayon machines', aisle: 'Allée A', shelves: 5, x: 6, y: 8, width: 38, height: 9 },
    { code: 2, label: 'Rayon imprimantes', aisle: 'Allée A', shelves: 5, x: 6, y: 22, width: 38, height: 9 },
    { code: 3, label: 'Rayon consommables', aisle: 'Allée B', shelves: 6, x: 6, y: 42, width: 38, height: 9 },
    { code: 4, label: 'Rayon écrans', aisle: 'Allée B', shelves: 4, x: 6, y: 56, width: 38, height: 9 },
  ],
  zones: [
    { code: 1, label: 'Palette réception', x: 58, y: 8, width: 24, height: 12 },
    { code: 2, label: 'Pile ProDesk', x: 58, y: 26, width: 24, height: 12 },
    { code: 3, label: 'Cage grillagée', x: 58, y: 44, width: 24, height: 14 },
  ],
  landmarks: [
    { kind: 'door', label: 'Entrée', x: 44, y: 0, width: 10, height: 2.5 },
    { kind: 'bench', label: 'Établi SAV', x: 58, y: 66, width: 26, height: 8 },
  ],
  // [référence, désignation, famille, libellé famille, emplacement, côté]
  items: [
    ['MX3071', 'Multifonction A3 MX-3071', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E1', 'left'],
    ['MX2651', 'Multifonction A3 MX-2651', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E2', null],
    ['BP70C31', 'Multifonction A3 BP-70C31', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E2', 'right'],
    ['BP20C25', 'Multifonction A3 BP-20C25', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E4', null],
    ['ARB123', 'Imprimante A3 couleur', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E2', 'center'],
    ['ARB456', 'Imprimante A4 N/B', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E2', null],
    ['ARM207', 'Imprimante A4 couleur', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E1', null],
    ['ARP350', 'Imprimante A3 N/B', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E5', null],
    ['UK707E/L', 'Toner noir UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1', 'left'],
    ['UK707E/C', 'Toner cyan UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1', 'left'],
    ['UK707E/M', 'Toner magenta UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1', 'center'],
    ['UK707E/Y', 'Toner jaune UK707', '0450', 'CONSOMMABLE TGC22', 'R03-E1', 'center'],
    ['MX561GT', 'Toner MX-561GT', '0450', 'CONSOMMABLE TGC22', 'R03-E2', 'right'],
    ['MX560DR', 'Tambour MX-560DR', '0450', 'CONSOMMABLE TGC22', 'R03-E2', null],
    ['AR208FS', 'Kit de fusion AR-208', '0450', 'CONSOMMABLE TGC22', 'R03-E6', null],
    ['PNE24T', 'Écran 24 pouces', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E1', null],
    ['PNE27T', 'Écran 27 pouces', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E1', 'right'],
    ['UPS1500', 'Onduleur 1500 VA', '0710', 'ACCESSOIRE INFORMATIQUE TGC22', 'R04-E4', null],
    // Articles posés directement sur une zone, sans étagère ni côté.
    ['B39VLAT', 'Copieur A3 couleur B39', '0110', 'COPIEUR MULTIFONCTION TGC22', 'Z02', null],
    ['PRODESK4', 'Poste fixe ProDesk 400', '0520', 'MICRO FIXE TGC22', 'Z02', null],
    ['MB14PRO', 'Poste portable 14 pouces', '0510', 'MICRO PORTABLE TGC22', 'Z03', null],
    ['CARTON50', 'Carton de rames A4 (×5)', '0810', 'PAPIER TGC22', 'Z01', null],
  ],
};

const SHARP_CENTER = {
  site: 'sharp-center',
  racks: [
    { code: 1, label: 'Rayon showroom', aisle: 'Allée 1', shelves: 4, x: 8, y: 12, width: 34, height: 10 },
    { code: 2, label: 'Rayon pièces', aisle: 'Allée 1', shelves: 6, x: 8, y: 28, width: 34, height: 10 },
  ],
  zones: [{ code: 1, label: 'Quai de livraison', x: 54, y: 12, width: 26, height: 16 }],
  landmarks: [{ kind: 'door', label: 'Entrée', x: 30, y: 0, width: 12, height: 2.5 }],
  items: [
    ['SC-MX4071', 'Multifonction A3 MX-4071', '0110', 'COPIEUR MULTIFONCTION TGC11', 'R01-E1', null],
    ['SC-BP50C26', 'Multifonction A3 BP-50C26', '0110', 'COPIEUR MULTIFONCTION TGC11', 'R01-E2', 'left'],
    ['SC-MX754GT', 'Toner MX-754GT', '0450', 'CONSOMMABLE TGC11', 'R02-E1', null],
    ['SC-MX753FU', 'Kit de fusion MX-753FU', '0450', 'CONSOMMABLE TGC11', 'R02-E3', 'right'],
    ['SC-PALETTE', 'Palette de rames A3', '0810', 'PAPIER TGC11', 'Z01', null],
  ],
};

const SERVICES = [
  ['DEPITUC', 'Redevance copie privée', '9100', 'REDEVANCE COPIE PRIVEE TGC22'],
  ['ECOPART', 'Éco-participation DEEE', '9110', 'ECOPARTICIPATION TGC22'],
  ['EXTGAR3', 'Extension de garantie 3 ans', '9200', 'EXTENSION DE GARANTIE TGC22'],
];

// Articles connus de SAGE mais rangés dans aucun des deux locaux.
const OFF_SITE = [['DUCOS01', 'Copieur stocké à Ducos', '0110', 'COPIEUR MULTIFONCTION TGC22']];

export function demoDataAvailable(db) {
  const racks = db.prepare('SELECT COUNT(*) AS n FROM racks').get().n;
  const items = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  return racks === 0 && items === 0;
}

export function seedDemoData(db, user) {
  const now = new Date().toISOString();

  return db.transaction(() => {
    const insertRack = db.prepare(
      `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    );
    const insertLandmark = db.prepare(
      `INSERT INTO landmarks (site_id, kind, label, x, y, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO items (reference, reference_display, designation, kind, family_code, family_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertLocation = db.prepare(
      'INSERT INTO item_locations (item_id, shelf_id, zone_id, side) VALUES (?, ?, ?, ?)',
    );

    let racks = 0;
    let zones = 0;
    let items = 0;

    const create = (reference, designation, familyCode, familyLabel, kind, target, code) => {
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
      if (target) insertLocation.run(id, target.shelf_id, target.zone_id, target.side ?? null);

      recordMovement(db, {
        item: { id, reference: normalizeReference(reference), designation },
        user,
        action: 'create',
        to: code ? { code } : null,
      });
      items += 1;
    };

    for (const plan of [OPTIMIUM, SHARP_CENTER]) {
      const site = db.prepare('SELECT * FROM sites WHERE code = ?').get(plan.site);
      if (!site) continue;

      // Code d'emplacement → { shelf_id } ou { zone_id }, pour ce local.
      const targets = new Map();

      for (const rack of plan.racks) {
        const info = insertRack.run(
          site.id,
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
        racks += 1;

        for (const shelf of db
          .prepare('SELECT id, shelf_index FROM shelves WHERE rack_id = ?')
          .all(created.id)) {
          targets.set(formatShelfCode(rack.code, shelf.shelf_index), {
            shelf_id: shelf.id,
            zone_id: null,
          });
        }
      }

      for (const zone of plan.zones) {
        const info = insertRack.run(
          site.id,
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
        zones += 1;
      }

      for (const landmark of plan.landmarks) {
        insertLandmark.run(
          site.id,
          landmark.kind,
          landmark.label,
          landmark.x,
          landmark.y,
          landmark.width,
          landmark.height,
          now,
        );
      }

      for (const [reference, designation, familyCode, familyLabel, code, side] of plan.items) {
        const target = targets.get(code);
        if (!target) throw new Error(`Emplacement de démonstration inconnu : ${code}`);
        create(reference, designation, familyCode, familyLabel, 'physical', { ...target, side }, code);
      }
    }

    // Ni service ni article hors PlanStock n'a d'emplacement : ils sont visibles
    // depuis les deux locaux.
    for (const [reference, designation, familyCode, familyLabel] of SERVICES) {
      create(reference, designation, familyCode, familyLabel, 'service', null, null);
    }
    for (const [reference, designation, familyCode, familyLabel] of OFF_SITE) {
      create(reference, designation, familyCode, familyLabel, 'other_site', null, null);
    }

    return { racks, zones, items };
  })();
}
