import { formatShelfCode, formatZoneCode } from './locationCode.js';
import { normalizeReference } from './reference.js';

/**
 * Le local « Démo ».
 *
 * Un magasin de SAV crédible, où l'on peut tout essayer devant quelqu'un :
 * chercher, ranger, déplacer, supprimer, redessiner un mur. Rien de ce qui s'y
 * passe ne touche Optimium ni Sharp Center — les deux ne partagent aucune ligne.
 *
 * Il est fait pour être **remis en place** : une démonstration laisse des
 * traces, et personne n'a envie de reconstruire un magasin à la main avant la
 * réunion suivante. `seedDemoSite` efface tout ce qui appartient à ce local et
 * le repose à l'identique.
 *
 * Le contenu est choisi pour que la visite guidée ait quelque chose à montrer à
 * chaque étape : des rayonnages classiques, une gondole à broches double face,
 * des zones sans étagère, un contour qui n'est pas un rectangle, et deux stocks
 * à part avec des références communes au stock général.
 */

/** Code du local, tel qu'il est posé par la migration 0006. */
export const DEMO_SITE_CODE = 'demo';

/**
 * Murs du local. Un L avec un angle coupé : c'est ce qui rend le plan
 * reconnaissable en un coup d'œil, et ce qu'un rectangle ne montre jamais.
 */
const OUTLINE = [
  [4, 4],
  [70, 4],
  [70, 28],
  [96, 28],
  [96, 74],
  [62, 96],
  [4, 96],
];

const RACKS = [
  {
    code: 1,
    label: 'Copieurs',
    aisle: 'Allée A',
    shelves: 4,
    x: 10,
    y: 12,
    width: 34,
    height: 8,
  },
  {
    code: 2,
    label: 'Imprimantes',
    aisle: 'Allée A',
    shelves: 5,
    x: 10,
    y: 26,
    width: 34,
    height: 8,
  },
  {
    code: 3,
    label: 'Consommables',
    aisle: 'Allée B',
    shelves: 6,
    x: 10,
    y: 46,
    width: 34,
    height: 8,
  },
  {
    code: 4,
    label: 'Écrans et accessoires',
    aisle: 'Allée B',
    shelves: 4,
    x: 10,
    y: 60,
    width: 34,
    height: 8,
  },
  // La gondole : un panneau perforé garni de broches, servi des deux côtés.
  // Posée en biais, comme dans le vrai magasin — et c'est ce qui montre que le
  // plan n'est pas obligé d'être d'équerre.
  {
    code: 5,
    label: 'Gondole pièces détachées',
    aisle: 'Allée C',
    shelves: 4,
    x: 62,
    y: 40,
    width: 28,
    height: 7,
    angle: 18,
    style: 'pegboard',
  },
];

const ZONES = [
  { code: 1, label: 'Palette réception', x: 50, y: 8, width: 16, height: 12 },
  { code: 2, label: 'Pile machines prêtes', x: 72, y: 56, width: 20, height: 12 },
  { code: 3, label: 'Cage grillagée', x: 50, y: 74, width: 20, height: 14 },
];

const LANDMARKS = [
  { kind: 'door', label: 'Entrée magasin', x: 4, y: 84, width: 2.5, height: 9, angle: 0 },
  { kind: 'door', label: 'Quai de livraison', x: 62, y: 4, width: 9, height: 2.5, angle: 0 },
  { kind: 'bench', label: 'Établi SAV', x: 72, y: 76, width: 20, height: 8, angle: 0 },
];

/** Stocks à part : les clients qui achètent à l'année, rangés au même endroit. */
const CUSTOMERS = ['AOCCI', 'Mairie de Nouméa'];

/**
 * Articles du stock général.
 * `[référence, désignation, code famille, libellé famille, emplacement, côté]`
 *
 * Les modèles sont volontairement **décalés** de ceux du catalogue : MX-3162 et
 * non MX-3071, UK-820E et non UK-707E. Ils sonnent juste devant quelqu'un — ce
 * qu'on attend d'une démonstration — sans risquer de tomber sur une référence
 * du vrai stock. Une référence est unique dans toute la base : le jour où
 * l'inventaire réel contiendrait la même, l'article de démonstration ne serait
 * pas posé et le local se viderait tout seul, réunion après réunion.
 */
const ITEMS = [
  ['MX-3162', 'Multifonction A3 couleur MX-3162', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E1', 'left'],
  ['MX-2662', 'Multifonction A3 couleur MX-2662', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E1', 'right'],
  ['BP-70C36', 'Multifonction A3 couleur BP-70C36', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E2', null],
  ['BP-20C26', 'Multifonction A3 couleur BP-20C26', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E3', 'center'],
  ['MX-M3162', 'Multifonction A3 N/B MX-M3162', '0110', 'COPIEUR MULTIFONCTION TGC22', 'R01-E4', null],

  ['AR-B455', 'Imprimante A3 couleur AR-B455', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E1', 'left'],
  ['AR-M262', 'Imprimante A4 couleur AR-M262', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E2', null],
  ['AR-P375', 'Imprimante A3 N/B AR-P375', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E3', 'right'],
  ['MX-B478P', 'Imprimante A4 N/B MX-B478P', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E4', null],
  ['DX-C316', 'Imprimante A4 couleur DX-C316', '0310', 'IMPRIMANTE LASER N/B TGC22', 'R02-E5', 'center'],

  ['MX-566GT', 'Toner noir MX-566GT', '0450', 'CONSOMMABLE TGC22', 'R03-E1', 'left'],
  ['MX-565DR', 'Tambour MX-565DR', '0450', 'CONSOMMABLE TGC22', 'R03-E1', 'right'],
  ['UK-820E/L', 'Toner noir UK-820E', '0450', 'CONSOMMABLE TGC22', 'R03-E2', 'left'],
  ['UK-820E/C', 'Toner cyan UK-820E', '0450', 'CONSOMMABLE TGC22', 'R03-E2', 'center'],
  ['UK-820E/M', 'Toner magenta UK-820E', '0450', 'CONSOMMABLE TGC22', 'R03-E2', 'center'],
  ['UK-820E/Y', 'Toner jaune UK-820E', '0450', 'CONSOMMABLE TGC22', 'R03-E2', 'right'],
  ['AR-213FS', 'Kit de fusion AR-213', '0450', 'CONSOMMABLE TGC22', 'R03-E4', null],
  ['MX-758GT', 'Toner noir MX-758GT', '0450', 'CONSOMMABLE TGC22', 'R03-E5', null],

  ['PN-E256T', 'Écran 25 pouces PN-E256T', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E1', 'left'],
  ['PN-E286T', 'Écran 28 pouces PN-E286T', '0620', 'ECRAN INFORMATIQUE TGC22', 'R04-E1', 'right'],
  ['OND-1600', 'Onduleur 1600 VA', '0710', 'ACCESSOIRE INFORMATIQUE TGC22', 'R04-E3', null],
  ['CBL-USB316', 'Câble USB 3.0 imprimante 1,6 m', '0710', 'ACCESSOIRE INFORMATIQUE TGC22', 'R04-E4', 'center'],

  // La gondole : des pièces détachées suspendues à des broches.
  ['ROUL-A316', 'Rouleau d’entraînement A3', '0480', 'PIECE DETACHEE TGC22', 'R05-B1', 'left'],
  ['ROUL-A416', 'Rouleau d’entraînement A4', '0480', 'PIECE DETACHEE TGC22', 'R05-B1', 'right'],
  ['COURR-MX16', 'Courroie de transfert MX', '0480', 'PIECE DETACHEE TGC22', 'R05-B2', 'left'],
  ['SEP-PAD16', 'Patin de séparation', '0480', 'PIECE DETACHEE TGC22', 'R05-B3', 'right'],

  // Articles posés directement sur une zone : ni étagère ni côté.
  ['B41-VLAT', 'Copieur A3 couleur B41 (reprise)', '0110', 'COPIEUR MULTIFONCTION TGC22', 'Z02', null],
  ['PRODESK-406', 'Poste fixe ProDesk 406', '0520', 'MICRO FIXE TGC22', 'Z02', null],
  ['MB-16PRO', 'Poste portable 16 pouces', '0510', 'MICRO PORTABLE TGC22', 'Z03', null],
  ['RAMES-A416', 'Carton de rames A4 (×5)', '0810', 'PAPIER TGC22', 'Z01', null],
];

/**
 * Réservations : les mêmes références que le stock général, mais rangées pour
 * un client. C'est tout l'intérêt d'un stock à part — deux exemplaires au même
 * endroit, un seul est disponible.
 * `[référence, client, emplacement, côté]`
 */
const RESERVATIONS = [
  ['MX-3162', 'AOCCI', 'R01-E2', 'right'],
  ['MX-566GT', 'AOCCI', 'R03-E3', 'left'],
  ['UK-820E/L', 'AOCCI', 'R03-E3', 'center'],
  ['PN-E256T', 'Mairie de Nouméa', 'R04-E2', null],
  ['AR-B455', 'Mairie de Nouméa', 'R02-E1', 'right'],
];

/**
 * Référence que la visite guidée tape à l'écran. Elle doit exister dans le
 * local **et** être réservée à un client, pour que l'étape des stocks à part
 * ait quelque chose à montrer sur la même référence.
 */
export const TOUR_REFERENCE = 'MX-3162';

/**
 * Aucun article sans emplacement ici, et c'est délibéré.
 *
 * Un article qui n'est rangé nulle part — une prestation, un article d'un autre
 * magasin — appartient à *tous* les locaux : la recherche le renvoie depuis
 * n'importe lequel, faute d'emplacement qui le rattacherait à l'un d'eux. Une
 * prestation de démonstration remonterait donc dans les recherches d'Optimium,
 * au milieu du vrai stock. Tout ce que pose la démonstration est rangé quelque
 * part, et reste ainsi enfermé dans son local.
 */

/** Le local de démonstration, ou `null` s'il n'est pas dans la base. */
export function findDemoSite(db) {
  return db.get('SELECT * FROM sites WHERE code = ?', DEMO_SITE_CODE);
}

/** Toutes les références du jeu, normalisées. */
function demoReferences() {
  return ITEMS.map(([reference]) => normalizeReference(reference));
}

/**
 * Identifiants des articles physiquement rangés dans le local.
 *
 * C'est ce qui rend la remise à zéro sûre. Effacer « les articles dont la
 * référence est dans le jeu de démonstration » supprimerait un vrai article
 * qui porterait par hasard la même référence — une prestation appelée
 * `MX-3071`, par exemple, n'est rangée nulle part et disparaîtrait sans bruit.
 * On ne touche donc qu'à ce qui était posé ici, et seulement si plus rien ne
 * le range ailleurs après le passage.
 */
function itemsStoredIn(db, siteId) {
  return db.all(
    `SELECT DISTINCT item_locations.item_id AS id
       FROM item_locations
       LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
       JOIN racks ON racks.id = COALESCE(shelves.rack_id, item_locations.zone_id)
      WHERE racks.site_id = ?`,
    siteId,
  );
}

/**
 * Repose le local de démonstration à neuf.
 *
 * Renvoie ce qui a été installé, et `skipped` : les références que le vrai
 * stock utilise déjà. Elles sont laissées de côté plutôt qu'écrasées — la
 * démonstration n'est jamais une raison de toucher au stock réel — et l'appelant
 * peut le dire franchement.
 */
export async function seedDemoSite(db, user) {
  const site = await findDemoSite(db);
  if (!site) throw new Error('Le local de démonstration est absent de la base.');

  const now = new Date().toISOString();
  const references = demoReferences();
  const placeholders = references.map(() => '?').join(', ');

  // Ce qui était rangé ici, relevé **avant** d'effacer les meubles : après, la
  // cascade a emporté les rangements et plus rien ne dirait qui était là.
  const stored = (await itemsStoredIn(db, site.id)).map((row) => row.id);
  const storedPlaceholders = stored.map(() => '?').join(', ');

  await db.batch([
    db.stmt('DELETE FROM racks WHERE site_id = ?', site.id),
    db.stmt('DELETE FROM landmarks WHERE site_id = ?', site.id),
    db.stmt('DELETE FROM customers WHERE site_id = ?', site.id),
    ...(stored.length > 0
      ? [
          // Un article qu'on a déplacé hors de la démonstration garde son
          // emplacement ailleurs : il survit, et c'est voulu.
          db.stmt(
            `DELETE FROM items
              WHERE id IN (${storedPlaceholders})
                AND id NOT IN (SELECT item_id FROM item_locations)`,
            ...stored,
          ),
          db.stmt(
            `DELETE FROM movements
              WHERE item_id IN (${storedPlaceholders})
                AND item_id NOT IN (SELECT id FROM items)`,
            ...stored,
          ),
        ]
      : []),
  ]);

  // Une référence du jeu encore présente appartient au vrai stock : on la lui
  // laisse, et l'article de démonstration correspondant n'est pas posé.
  const survivors = new Set(
    (
      await db.all(`SELECT reference FROM items WHERE reference IN (${placeholders})`, ...references)
    ).map((row) => row.reference),
  );

  // 1. Murs, meubles et repères
  await db.run('UPDATE sites SET outline = ? WHERE id = ?', JSON.stringify(OUTLINE), site.id);
  await db.batch([
    ...RACKS.map((rack) =>
      db.stmt(
        `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count,
                            x, y, width, height, rotation, angle, style, created_at)
         VALUES (?, ?, 'rack', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        site.id, rack.code, rack.label, rack.aisle, rack.shelves,
        rack.x, rack.y, rack.width, rack.height,
        rack.angle ?? 0, rack.style ?? '', now,
      ),
    ),
    ...ZONES.map((zone) =>
      db.stmt(
        `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count,
                            x, y, width, height, rotation, angle, style, created_at)
         VALUES (?, ?, 'zone', ?, '', 0, ?, ?, ?, ?, 0, 0, '', ?)`,
        site.id, zone.code, zone.label, zone.x, zone.y, zone.width, zone.height, now,
      ),
    ),
    ...LANDMARKS.map((landmark) =>
      db.stmt(
        `INSERT INTO landmarks (site_id, kind, label, x, y, width, height, angle, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        site.id, landmark.kind, landmark.label,
        landmark.x, landmark.y, landmark.width, landmark.height, landmark.angle, now,
      ),
    ),
    ...CUSTOMERS.map((name) =>
      db.stmt(
        'INSERT INTO customers (site_id, name, created_at) VALUES (?, ?, ?)',
        site.id, name, now,
      ),
    ),
  ]);

  // 2. Étagères des meubles tout juste posés
  const racks = await db.all(
    'SELECT id, code, kind, shelves_count FROM racks WHERE site_id = ?',
    site.id,
  );
  await db.batch(
    racks.flatMap((rack) =>
      Array.from({ length: rack.shelves_count }, (_, index) =>
        db.stmt('INSERT INTO shelves (rack_id, shelf_index) VALUES (?, ?)', rack.id, index + 1),
      ),
    ),
  );

  // 3. Table des destinations : « R03-E1 » → étagère, « Z02 » → zone
  const shelves = await db.all(
    `SELECT shelves.id, shelves.rack_id, shelves.shelf_index
       FROM shelves JOIN racks ON racks.id = shelves.rack_id
      WHERE racks.site_id = ?`,
    site.id,
  );
  const targets = new Map();
  for (const rack of racks) {
    if (rack.kind === 'zone') {
      targets.set(formatZoneCode(rack.code), { shelf_id: null, zone_id: rack.id });
      continue;
    }
    for (const shelf of shelves.filter((row) => row.rack_id === rack.id)) {
      targets.set(formatShelfCode(rack.code, shelf.shelf_index), {
        shelf_id: shelf.id,
        zone_id: null,
      });
      // Une gondole se code en broches (R05-B3) : les deux écritures visent la
      // même rangée, et le jeu peut nommer l'une ou l'autre.
      targets.set(formatShelfCode(rack.code, shelf.shelf_index, 'pegboard'), {
        shelf_id: shelf.id,
        zone_id: null,
      });
    }
  }

  // 4. Articles
  const rows = ITEMS.map(([reference, designation, familyCode, familyLabel, code, side]) => ({
    reference, designation, familyCode, familyLabel, code, side,
  })).filter((row) => !survivors.has(normalizeReference(row.reference)));

  await db.batch(
    rows.map((row) =>
      db.stmt(
        `INSERT INTO items (reference, reference_display, designation, kind,
                            family_code, family_label, created_at, updated_at)
         VALUES (?, ?, ?, 'physical', ?, ?, ?, ?)`,
        normalizeReference(row.reference), row.reference, row.designation,
        row.familyCode, row.familyLabel, now, now,
      ),
    ),
  );

  const itemIds = new Map(
    (
      await db.all(`SELECT id, reference FROM items WHERE reference IN (${placeholders})`, ...references)
    ).map((item) => [item.reference, item.id]),
  );

  // 5. Rangements du stock général, puis ceux des stocks à part
  const customerIds = new Map(
    (await db.all('SELECT id, name FROM customers WHERE site_id = ?', site.id)).map((row) => [
      row.name,
      row.id,
    ]),
  );

  const placements = [];
  for (const row of rows) {
    const itemId = itemIds.get(normalizeReference(row.reference));
    const target = row.code ? targets.get(row.code) : null;
    if (row.code && !target) throw new Error(`Emplacement de démonstration inconnu : ${row.code}`);

    if (target) {
      placements.push(
        db.stmt(
          `INSERT INTO item_locations (item_id, shelf_id, zone_id, side, customer_id)
           VALUES (?, ?, ?, ?, NULL)`,
          itemId, target.shelf_id, target.zone_id, target.shelf_id ? row.side : null,
        ),
      );
    }
    placements.push(
      db.stmt(
        `INSERT INTO movements (item_id, item_reference, item_designation, user_id,
                                user_first_name, action, from_code, to_code, created_at)
         VALUES (?, ?, ?, ?, ?, 'create', NULL, ?, ?)`,
        itemId, normalizeReference(row.reference), row.designation,
        user.id, user.first_name, row.code, now,
      ),
    );
  }

  let reserved = 0;
  for (const [reference, customer, code, side] of RESERVATIONS) {
    const itemId = itemIds.get(normalizeReference(reference));
    const customerId = customerIds.get(customer);
    const target = targets.get(code);
    // Une référence laissée au vrai stock n'a pas d'article ici : sa
    // réservation saute avec elle, sans faire échouer le reste.
    if (!itemId || !customerId || !target) continue;

    reserved += 1;
    placements.push(
      db.stmt(
        `INSERT INTO item_locations (item_id, shelf_id, zone_id, side, customer_id)
         VALUES (?, ?, ?, ?, ?)`,
        itemId, target.shelf_id, target.zone_id, target.shelf_id ? side : null, customerId,
      ),
    );
  }

  await db.batch(placements);

  return {
    site_id: site.id,
    racks: RACKS.length,
    zones: ZONES.length,
    items: rows.length,
    customers: CUSTOMERS.length,
    reserved,
    /** Références laissées au vrai stock, donc absentes de la démonstration. */
    skipped: [...survivors],
  };
}
