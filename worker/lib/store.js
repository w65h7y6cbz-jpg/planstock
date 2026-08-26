import { formatShelfCode, formatShelfShortCode, formatZoneCode } from './locationCode.js';
import { conflict, notFound } from './http.js';

/**
 * Lectures et écritures du stock. Tout est asynchrone : D1 l'est.
 */

const ITEM_COLUMNS = `
  items.id, items.reference, items.reference_display, items.designation,
  items.kind, items.family_code, items.family_label, items.created_at, items.updated_at
`;

/**
 * Colonnes décrivant un emplacement. Le rayonnage/zone porteur est ramené par
 * `COALESCE`, et son local par la jointure sur `sites`.
 */
const LOCATION_COLUMNS = `
  item_locations.shelf_id,
  item_locations.zone_id,
  item_locations.side,
  item_locations.customer_id,
  customers.name AS customer_name,
  shelves.shelf_index,
  racks.id     AS rack_id,
  racks.code   AS rack_code,
  racks.kind   AS rack_kind,
  racks.label  AS rack_label,
  racks.aisle  AS rack_aisle,
  racks.style  AS rack_style,
  sites.id     AS site_id,
  sites.code   AS site_code,
  sites.name   AS site_name
`;

/** Côtés admis d'une étagère. `null` = non précisé, cas le plus courant. */
export const SIDES = ['left', 'center', 'right'];

/** Emplacement enrichi de ses codes calculés. */
export function decorateLocation(row) {
  const isShelf = row.shelf_id !== null && row.shelf_id !== undefined;
  const style = row.rack_style ?? '';
  const code = isShelf
    ? formatShelfCode(row.rack_code, row.shelf_index, style)
    : formatZoneCode(row.rack_code);

  return {
    kind: isShelf ? 'shelf' : 'zone',
    shelf_id: isShelf ? row.shelf_id : null,
    zone_id: isShelf ? null : row.rack_id,
    rack_id: row.rack_id,
    rack_code: row.rack_code,
    rack_kind: row.rack_kind,
    rack_label: row.rack_label,
    rack_aisle: row.rack_aisle ?? '',
    /** Aspect du meuble porteur : une gondole se range sur des broches. */
    rack_style: style,
    shelf_index: isShelf ? row.shelf_index : null,
    // Indication facultative, jamais dans le code d'emplacement.
    side: isShelf ? (row.side ?? null) : null,
    // Vide = stock global du local. Renseigné = réservé à ce client.
    customer_id: row.customer_id ?? null,
    customer_name: row.customer_name ?? '',
    site_id: row.site_id ?? null,
    site_code: row.site_code ?? '',
    site_name: row.site_name ?? '',
    short_code: isShelf ? formatShelfShortCode(row.shelf_index, style) : code,
    code,
  };
}

/**
 * Restriction SQL sur le propriétaire d'un emplacement.
 *
 * Trois cas, et la distinction compte : `undefined` n'est pas `null`.
 *   - `undefined` : tout, réservations comprises (écrans de gestion) ;
 *   - `null`      : le stock global seul, c'est la recherche par défaut ;
 *   - un nombre   : le sous-stock de ce client seul.
 */
function ownerClause(customerId) {
  if (customerId === undefined) return '';
  if (customerId === null) return ' AND item_locations.customer_id IS NULL';
  return ' AND item_locations.customer_id = ?';
}

/** Paramètres de `ownerClause`, à insérer dans le même ordre. */
const ownerParams = (customerId) => (typeof customerId === 'number' ? [customerId] : []);

/**
 * Attache la liste `locations` à chaque article.
 * `customerId` suit la convention de `ownerClause` ci-dessus.
 */
export async function attachLocations(db, items, customerId = undefined) {
  if (items.length === 0) return items;

  const byId = new Map(items.map((item) => [item.id, { ...item, locations: [] }]));
  const ids = [...byId.keys()];
  const placeholders = ids.map(() => '?').join(', ');

  const rows = await db.all(
    `SELECT item_locations.item_id, ${LOCATION_COLUMNS}
       FROM item_locations
       LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
       LEFT JOIN racks ON racks.id = COALESCE(shelves.rack_id, item_locations.zone_id)
       LEFT JOIN sites ON sites.id = racks.site_id
       LEFT JOIN customers ON customers.id = item_locations.customer_id
      WHERE item_locations.item_id IN (${placeholders})${ownerClause(customerId)}
      ORDER BY racks.kind, racks.code, shelves.shelf_index`,
    ...ids,
    ...ownerParams(customerId),
  );

  for (const row of rows) {
    byId.get(row.item_id)?.locations.push(decorateLocation(row));
  }
  return [...byId.values()];
}

export async function findItemById(db, id) {
  const item = await db.get(`SELECT ${ITEM_COLUMNS} FROM items WHERE items.id = ?`, id);
  if (!item) throw notFound('Article introuvable.');
  return (await attachLocations(db, [item]))[0];
}

/**
 * Un article appartient au local de son emplacement. Les articles Service et
 * Hors PlanStock n'en ont aucun : ils restent visibles depuis les deux locaux,
 * sinon une référence de service serait déclarée introuvable selon l'écran.
 */
/**
 * Avec un client, la recherche ne voit plus que son sous-stock : une référence
 * rangée seulement au stock global ressort « inconnue » depuis chez AOCCI, et
 * c'est voulu — sinon on irait piocher dans la mauvaise pile.
 *
 * La seconde branche, elle, ne se filtre jamais par client : un article Service
 * ou Hors PlanStock n'a aucun emplacement, donc aucun propriétaire. Le filtrer
 * le rendrait introuvable dès qu'un client est choisi, alors qu'un service
 * reste un service quel que soit le stock regardé.
 */
function siteFilter(customerId) {
  return `(
  EXISTS (
    SELECT 1 FROM item_locations
      LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
      JOIN racks ON racks.id = COALESCE(shelves.rack_id, item_locations.zone_id)
     WHERE item_locations.item_id = items.id AND racks.site_id = ?${ownerClause(customerId)}
  )
  OR NOT EXISTS (SELECT 1 FROM item_locations WHERE item_locations.item_id = items.id)
)`;
}

/** Paramètres de `siteFilter`, dans l'ordre où la requête les attend. */
const siteFilterParams = (siteId, customerId) => [siteId, ...ownerParams(customerId)];

/**
 * Recherche exacte. Avec `siteId`, l'article n'est renvoyé que s'il est rangé
 * dans ce local (ou nulle part) : la recherche ne franchit pas les locaux.
 * Avec `customerId`, elle ne regarde que le sous-stock de ce client.
 */
export async function findItemByReference(db, reference, siteId = null, customerId = null) {
  const item = await db.get(
    `SELECT ${ITEM_COLUMNS} FROM items
      WHERE items.reference = ?${siteId ? ` AND ${siteFilter(customerId)}` : ''}`,
    reference,
    ...(siteId ? siteFilterParams(siteId, customerId) : []),
  );
  return item ? (await attachLocations(db, [item], customerId))[0] : null;
}

/**
 * `customerId` suit la convention de `ownerClause` : laissé de côté, la liste
 * ramène tout ; à `null` elle se limite au stock global ; à un nombre, au
 * sous-stock de ce client.
 */
export async function listItems(
  db,
  { search = null, designation = null, siteId = null, customerId = undefined, limit = null } = {},
) {
  let sql = `SELECT ${ITEM_COLUMNS} FROM items`;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push("items.reference LIKE ? ESCAPE '\\'");
    params.push(`${escapeLike(search)}%`);
  }
  if (designation) {
    // LIKE est déjà insensible à la casse sur l'ASCII dans SQLite.
    conditions.push("items.designation LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(designation)}%`);
  }
  if (siteId) {
    conditions.push(siteFilter(customerId));
    params.push(...siteFilterParams(siteId, customerId));
  }

  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY items.reference';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return attachLocations(db, await db.all(sql, ...params), customerId);
}

/** Échappe `%` et `_` pour une comparaison LIKE de préfixe. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Étagère avec son rayonnage, son local et son code complet, ou 404. */
export async function findShelf(db, shelfId, side = null) {
  const row = await db.get(
    `SELECT shelves.id AS shelf_id, NULL AS zone_id, shelves.shelf_index,
            racks.id AS rack_id, racks.code AS rack_code, racks.kind AS rack_kind,
            racks.label AS rack_label, racks.aisle AS rack_aisle,
            racks.style AS rack_style,
            sites.id AS site_id, sites.code AS site_code, sites.name AS site_name
       FROM shelves
       JOIN racks ON racks.id = shelves.rack_id
       JOIN sites ON sites.id = racks.site_id
      WHERE shelves.id = ?`,
    shelfId,
  );
  if (!row) throw notFound('Étagère introuvable.');
  return decorateLocation({ ...row, side });
}

/** Zone avec son code, ou 404 si l'identifiant ne désigne pas une zone. */
export async function findZone(db, zoneId) {
  const row = await db.get(
    `SELECT NULL AS shelf_id, racks.id AS zone_id, NULL AS shelf_index,
            racks.id AS rack_id, racks.code AS rack_code, racks.kind AS rack_kind,
            racks.label AS rack_label, racks.aisle AS rack_aisle,
            racks.style AS rack_style,
            sites.id AS site_id, sites.code AS site_code, sites.name AS site_name
       FROM racks
       JOIN sites ON sites.id = racks.site_id
      WHERE racks.id = ? AND racks.kind = 'zone'`,
    zoneId,
  );
  if (!row) throw notFound('Zone introuvable.');
  return decorateLocation(row);
}

/** Local, ou 404. */
export async function findSite(db, siteId) {
  const site = await db.get('SELECT * FROM sites WHERE id = ?', siteId);
  if (!site) throw notFound('Local introuvable.');
  return site;
}

/** Locaux dans l'ordre d'affichage, avec ce qu'ils contiennent. */
export function listSites(db) {
  return db.all(
    `SELECT sites.*,
            (SELECT COUNT(*) FROM racks
              WHERE racks.site_id = sites.id AND racks.kind = 'rack') AS racks_count,
            (SELECT COUNT(*) FROM racks
              WHERE racks.site_id = sites.id AND racks.kind = 'zone') AS zones_count,
            (SELECT COUNT(*) FROM item_locations
               LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
               JOIN racks ON racks.id = COALESCE(shelves.rack_id, item_locations.zone_id)
              WHERE racks.site_id = sites.id) AS items_count
       FROM sites ORDER BY sites.position, sites.id`,
  );
}

const SHELF_ITEM_COLUMNS = `
  items.id AS item_id, items.reference, items.reference_display,
  items.designation, items.kind, items.family_code, items.family_label,
  item_locations.side,
  item_locations.customer_id,
  customers.name AS customer_name
`;

/** Étagères d'un rayonnage, de la plus haute (E1) à la plus basse, avec leurs articles. */
export async function listRackShelves(db, rackId) {
  const rack = await db.get('SELECT * FROM racks WHERE id = ?', rackId);
  if (!rack) throw notFound('Rayonnage introuvable.');

  const rows = await db.all(
    `SELECT shelves.id, shelves.shelf_index, ${SHELF_ITEM_COLUMNS}
       FROM shelves
       LEFT JOIN item_locations ON item_locations.shelf_id = shelves.id
       LEFT JOIN items ON items.id = item_locations.item_id
       LEFT JOIN customers ON customers.id = item_locations.customer_id
      WHERE shelves.rack_id = ?
      ORDER BY shelves.shelf_index, items.reference`,
    rackId,
  );

  const shelves = new Map();
  for (const row of rows) {
    if (!shelves.has(row.id)) {
      shelves.set(row.id, {
        id: row.id,
        rack_id: rack.id,
        rack_code: rack.code,
        shelf_index: row.shelf_index,
        short_code: formatShelfShortCode(row.shelf_index, rack.style),
        code: formatShelfCode(rack.code, row.shelf_index, rack.style),
        items: [],
      });
    }
    if (row.item_id) shelves.get(row.id).items.push(toShelfItem(row));
  }
  return [...shelves.values()];
}

/** Articles posés directement sur une zone. */
export async function listZoneItems(db, zoneId) {
  const rows = await db.all(
    `SELECT ${SHELF_ITEM_COLUMNS}
       FROM item_locations
       JOIN items ON items.id = item_locations.item_id
       LEFT JOIN customers ON customers.id = item_locations.customer_id
      WHERE item_locations.zone_id = ?
      ORDER BY items.reference`,
    zoneId,
  );
  return rows.map(toShelfItem);
}

function toShelfItem(row) {
  return {
    id: row.item_id,
    reference: row.reference,
    reference_display: row.reference_display,
    designation: row.designation,
    kind: row.kind,
    family_code: row.family_code,
    family_label: row.family_label,
    side: row.side ?? null,
    // Vide = stock global. Renseigné = cette ligne-ci est réservée.
    customer_id: row.customer_id ?? null,
    customer_name: row.customer_name ?? '',
  };
}

/** (Re)génère les étagères d'un rayonnage sans toucher à celles déjà occupées. */
export async function syncRackShelves(db, rack) {
  const existing = await db.all('SELECT id, shelf_index FROM shelves WHERE rack_id = ?', rack.id);
  const obsolete = existing.filter((shelf) => shelf.shelf_index > rack.shelves_count);

  const statements = [];

  if (obsolete.length > 0) {
    const occupied = [];
    for (const shelf of obsolete) {
      if ((await shelfItemCount(db, shelf.id)) > 0) occupied.push(shelf);
    }
    if (occupied.length > 0) {
      const codes = occupied.map((shelf) => formatShelfCode(rack.code, shelf.shelf_index));
      throw conflict(
        `Impossible de réduire ce rayonnage : ${codes.length} étagère(s) encore occupée(s) — ${codes.join(', ')}. Déplacez d’abord ces articles.`,
        { codes },
      );
    }
    for (const shelf of obsolete) {
      statements.push(db.stmt('DELETE FROM shelves WHERE id = ?', shelf.id));
    }
  }

  const known = new Set(existing.map((shelf) => shelf.shelf_index));
  for (let index = 1; index <= rack.shelves_count; index += 1) {
    if (!known.has(index)) {
      statements.push(
        db.stmt('INSERT INTO shelves (rack_id, shelf_index) VALUES (?, ?)', rack.id, index),
      );
    }
  }

  await db.batch(statements);
}

export async function shelfItemCount(db, shelfId) {
  const row = await db.get(
    'SELECT COUNT(*) AS total FROM item_locations WHERE shelf_id = ?',
    shelfId,
  );
  return row.total;
}

/** Articles portés par un rayonnage (via ses étagères) ou par une zone. */
export async function rackItemCount(db, rackId) {
  const row = await db.get(
    `SELECT COUNT(*) AS total
       FROM item_locations
       LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
      WHERE COALESCE(shelves.rack_id, item_locations.zone_id) = ?`,
    rackId,
  );
  return row.total;
}

/**
 * Instruction d'écriture d'un mouvement, à composer dans un `batch`.
 * Les codes d'emplacement sont figés en clair pour que l'historique reste
 * lisible après suppression de l'article ou du rayonnage.
 */
/**
 * Code d'emplacement tel qu'il s'écrit dans l'historique. Le sous-stock y
 * figure : « R03-E1 » et « R03-E1 · AOCCI » sont deux rangements différents, et
 * l'historique doit permettre de les distinguer des années plus tard.
 */
function historyCode(location) {
  if (!location) return null;
  return location.customer_name ? `${location.code} · ${location.customer_name}` : location.code;
}

export function movementStatement(db, { item, user, action, from = null, to = null }) {
  return db.stmt(
    `INSERT INTO movements (
       item_id, item_reference, item_designation, user_id, user_first_name,
       action, from_code, to_code, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id ?? null,
    item.reference,
    item.designation ?? '',
    user.id,
    user.first_name,
    action,
    historyCode(from),
    historyCode(to),
    new Date().toISOString(),
  );
}

/**
 * Même chose, mais l'article vient d'être inséré dans le même `batch` : son
 * identifiant se retrouve par sa référence, qui est unique.
 */
export function movementStatementByReference(db, { reference, designation, user, action, to = null }) {
  return db.stmt(
    `INSERT INTO movements (
       item_id, item_reference, item_designation, user_id, user_first_name,
       action, from_code, to_code, created_at
     ) VALUES ((SELECT id FROM items WHERE reference = ?), ?, ?, ?, ?, ?, NULL, ?, ?)`,
    reference,
    reference,
    designation ?? '',
    user.id,
    user.first_name,
    action,
    historyCode(to),
    new Date().toISOString(),
  );
}
