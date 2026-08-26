import { formatShelfCode, formatZoneCode } from './locationCode.js';
import { normalizeReference } from './reference.js';

/**
 * Jeu de démonstration : deux locaux plausibles pour découvrir l'application
 * sans saisir l'inventaire réel. Ne s'installe que sur une base sans
 * emplacement ni article, pour ne jamais écraser de vraies données.
 *
 * Les références restent uniques d'un local à l'autre : un article n'a qu'un
 * seul emplacement, il ne peut pas être rangé dans les deux.
 */

export const OPTIMIUM = {
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

export const SHARP_CENTER = {
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

export const SERVICES = [
  ['DEPITUC', 'Redevance copie privée', '9100', 'REDEVANCE COPIE PRIVEE TGC22'],
  ['ECOPART', 'Éco-participation DEEE', '9110', 'ECOPARTICIPATION TGC22'],
  ['EXTGAR3', 'Extension de garantie 3 ans', '9200', 'EXTENSION DE GARANTIE TGC22'],
];

// Articles connus de SAGE mais rangés dans aucun des deux locaux.
export const OFF_SITE = [['DUCOS01', 'Copieur stocké à Ducos', '0110', 'COPIEUR MULTIFONCTION TGC22']];

export async function demoDataAvailable(db) {
  const racks = await db.get('SELECT COUNT(*) AS n FROM racks');
  const items = await db.get('SELECT COUNT(*) AS n FROM items');
  return racks.n === 0 && items.n === 0;
}

/**
 * D1 n'a pas de transaction interactive : on ne peut pas lire un identifiant
 * fraîchement inséré au milieu d'une écriture. Le chargement se fait donc en
 * passes — les meubles, puis leurs étagères, puis les articles, puis leurs
 * emplacements — chaque passe étant elle-même atomique.
 */
export async function seedDemoData(db, user) {
  const now = new Date().toISOString();

  const sites = new Map(
    (await db.all('SELECT id, code FROM sites')).map((site) => [site.code, site.id]),
  );

  // 1. Rayonnages et zones
  const rackStatements = [];
  for (const plan of [OPTIMIUM, SHARP_CENTER]) {
    const siteId = sites.get(plan.site);
    if (!siteId) continue;

    for (const rack of plan.racks) {
      rackStatements.push(
        db.stmt(
          `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
           VALUES (?, ?, 'rack', ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          siteId, rack.code, rack.label, rack.aisle, rack.shelves,
          rack.x, rack.y, rack.width, rack.height, now,
        ),
      );
    }
    for (const zone of plan.zones) {
      rackStatements.push(
        db.stmt(
          `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
           VALUES (?, ?, 'zone', ?, '', 0, ?, ?, ?, ?, 0, ?)`,
          siteId, zone.code, zone.label, zone.x, zone.y, zone.width, zone.height, now,
        ),
      );
    }
    for (const landmark of plan.landmarks) {
      rackStatements.push(
        db.stmt(
          `INSERT INTO landmarks (site_id, kind, label, x, y, width, height, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          siteId, landmark.kind, landmark.label,
          landmark.x, landmark.y, landmark.width, landmark.height, now,
        ),
      );
    }
  }
  await db.batch(rackStatements);

  // 2. Étagères des rayonnages tout juste créés
  const createdRacks = await db.all('SELECT id, site_id, code, kind, shelves_count FROM racks');
  await db.batch(
    createdRacks.flatMap((rack) =>
      Array.from({ length: rack.shelves_count }, (_, index) =>
        db.stmt('INSERT INTO shelves (rack_id, shelf_index) VALUES (?, ?)', rack.id, index + 1),
      ),
    ),
  );

  // 3. Table des destinations, par local : « R03-E1 » → étagère, « Z02 » → zone
  const shelves = await db.all('SELECT id, rack_id, shelf_index FROM shelves');
  const targets = new Map();
  for (const rack of createdRacks) {
    const perSite = targets.get(rack.site_id) ?? new Map();
    targets.set(rack.site_id, perSite);

    if (rack.kind === 'zone') {
      perSite.set(formatZoneCode(rack.code), { shelf_id: null, zone_id: rack.id });
      continue;
    }
    for (const shelf of shelves.filter((row) => row.rack_id === rack.id)) {
      perSite.set(formatShelfCode(rack.code, shelf.shelf_index), {
        shelf_id: shelf.id,
        zone_id: null,
      });
    }
  }

  // 4. Articles. Les références sont uniques d'un local à l'autre : un article
  //    n'a qu'un seul emplacement, il ne peut pas être rangé dans les deux.
  const rows = [
    ...OPTIMIUM.items.map((row) => ({ plan: OPTIMIUM, row, kind: 'physical' })),
    ...SHARP_CENTER.items.map((row) => ({ plan: SHARP_CENTER, row, kind: 'physical' })),
    ...SERVICES.map((row) => ({ plan: null, row, kind: 'service' })),
    ...OFF_SITE.map((row) => ({ plan: null, row, kind: 'other_site' })),
  ];

  await db.batch(
    rows.map(({ row, kind }) => {
      const [reference, designation, familyCode, familyLabel] = row;
      return db.stmt(
        `INSERT INTO items (reference, reference_display, designation, kind,
                            family_code, family_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        normalizeReference(reference), reference, designation, kind,
        familyCode, familyLabel, now, now,
      );
    }),
  );

  // 5. Emplacements et historique
  const itemIds = new Map(
    (await db.all('SELECT id, reference FROM items')).map((item) => [item.reference, item.id]),
  );

  const placements = [];
  for (const { plan, row } of rows) {
    const [reference, designation, , , code, side] = row;
    const itemId = itemIds.get(normalizeReference(reference));
    const perSite = plan ? targets.get(sites.get(plan.site)) : null;
    const target = code && perSite ? perSite.get(code) : null;

    if (code && !target) throw new Error(`Emplacement de démonstration inconnu : ${code}`);

    if (target) {
      placements.push(
        db.stmt(
          'INSERT INTO item_locations (item_id, shelf_id, zone_id, side) VALUES (?, ?, ?, ?)',
          itemId, target.shelf_id, target.zone_id, target.shelf_id ? (side ?? null) : null,
        ),
      );
    }
    placements.push(
      db.stmt(
        `INSERT INTO movements (item_id, item_reference, item_designation, user_id,
                                user_first_name, action, from_code, to_code, created_at)
         VALUES (?, ?, ?, ?, ?, 'create', NULL, ?, ?)`,
        itemId, normalizeReference(reference), designation,
        user.id, user.first_name, code ?? null, now,
      ),
    );
  }
  await db.batch(placements);

  return {
    racks: createdRacks.filter((rack) => rack.kind === 'rack').length,
    zones: createdRacks.filter((rack) => rack.kind === 'zone').length,
    items: rows.length,
  };
}
