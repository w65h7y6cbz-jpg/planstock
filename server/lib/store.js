import { formatShelfCode, formatShelfShortCode, formatZoneCode } from './locationCode.js';
import { conflict, notFound } from './http.js';

const ITEM_COLUMNS = `
  items.id, items.reference, items.reference_display, items.designation,
  items.kind, items.family_code, items.family_label, items.created_at, items.updated_at
`;

/**
 * Un emplacement est soit une étagère de rayonnage, soit une zone.
 * `COALESCE` ramène les deux cas au rayonnage/zone porteur.
 */
const LOCATION_QUERY = `
  SELECT item_locations.item_id,
         item_locations.shelf_id,
         item_locations.zone_id,
         shelves.shelf_index,
         racks.id    AS rack_id,
         racks.code  AS rack_code,
         racks.kind  AS rack_kind,
         racks.label AS rack_label,
         racks.aisle AS rack_aisle
    FROM item_locations
    LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
    LEFT JOIN racks ON racks.id = COALESCE(shelves.rack_id, item_locations.zone_id)
   WHERE item_locations.item_id IN (SELECT value FROM json_each(?))
   ORDER BY racks.kind, racks.code, shelves.shelf_index
`;

/** Emplacement enrichi de ses codes calculés. */
export function decorateLocation(row) {
  const isShelf = row.shelf_id !== null && row.shelf_id !== undefined;
  const code = isShelf
    ? formatShelfCode(row.rack_code, row.shelf_index)
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
    shelf_index: isShelf ? row.shelf_index : null,
    short_code: isShelf ? formatShelfShortCode(row.shelf_index) : code,
    code,
  };
}

/** Attache la liste `locations` à chaque article. */
export function attachLocations(db, items) {
  if (items.length === 0) return items;

  const byId = new Map(items.map((item) => [item.id, { ...item, locations: [] }]));
  const rows = db.prepare(LOCATION_QUERY).all(JSON.stringify([...byId.keys()]));

  for (const row of rows) {
    byId.get(row.item_id)?.locations.push(decorateLocation(row));
  }
  return [...byId.values()];
}

export function findItemById(db, id) {
  const item = db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE items.id = ?`).get(id);
  if (!item) throw notFound('Article introuvable.');
  return attachLocations(db, [item])[0];
}

export function findItemByReference(db, reference) {
  const item = db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE items.reference = ?`)
    .get(reference);
  return item ? attachLocations(db, [item])[0] : null;
}

export function listItems(db, { search = null, limit = null } = {}) {
  let sql = `SELECT ${ITEM_COLUMNS} FROM items`;
  const params = [];

  if (search) {
    sql += " WHERE items.reference LIKE ? ESCAPE '\\'";
    params.push(`${escapeLike(search)}%`);
  }
  sql += ' ORDER BY items.reference';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return attachLocations(db, db.prepare(sql).all(...params));
}

/** Échappe `%` et `_` pour une comparaison LIKE de préfixe. */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Étagère avec son rayonnage et son code complet, ou 404. */
export function findShelf(db, shelfId) {
  const row = db
    .prepare(
      `SELECT shelves.id AS shelf_id, NULL AS zone_id, shelves.shelf_index,
              racks.id AS rack_id, racks.code AS rack_code, racks.kind AS rack_kind,
              racks.label AS rack_label, racks.aisle AS rack_aisle
         FROM shelves JOIN racks ON racks.id = shelves.rack_id
        WHERE shelves.id = ?`,
    )
    .get(shelfId);
  if (!row) throw notFound('Étagère introuvable.');
  return decorateLocation(row);
}

/** Zone avec son code, ou 404 si l'identifiant ne désigne pas une zone. */
export function findZone(db, zoneId) {
  const row = db
    .prepare(
      `SELECT NULL AS shelf_id, racks.id AS zone_id, NULL AS shelf_index,
              racks.id AS rack_id, racks.code AS rack_code, racks.kind AS rack_kind,
              racks.label AS rack_label, racks.aisle AS rack_aisle
         FROM racks WHERE racks.id = ? AND racks.kind = 'zone'`,
    )
    .get(zoneId);
  if (!row) throw notFound('Zone introuvable.');
  return decorateLocation(row);
}

const SLOT_ITEM_COLUMNS = `
  items.id AS item_id, items.reference, items.reference_display,
  items.designation, items.kind, items.family_code, items.family_label
`;

/** Étagères d'un rayonnage, de la plus haute (E1) à la plus basse, avec leurs articles. */
export function listRackShelves(db, rackId) {
  const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(rackId);
  if (!rack) throw notFound('Rayonnage introuvable.');

  const rows = db
    .prepare(
      `SELECT shelves.id, shelves.shelf_index, ${SLOT_ITEM_COLUMNS}
         FROM shelves
         LEFT JOIN item_locations ON item_locations.shelf_id = shelves.id
         LEFT JOIN items ON items.id = item_locations.item_id
        WHERE shelves.rack_id = ?
        ORDER BY shelves.shelf_index, items.reference`,
    )
    .all(rackId);

  const shelves = new Map();
  for (const row of rows) {
    if (!shelves.has(row.id)) {
      shelves.set(row.id, {
        id: row.id,
        rack_id: rack.id,
        rack_code: rack.code,
        shelf_index: row.shelf_index,
        short_code: formatShelfShortCode(row.shelf_index),
        code: formatShelfCode(rack.code, row.shelf_index),
        items: [],
      });
    }
    if (row.item_id) shelves.get(row.id).items.push(toShelfItem(row));
  }
  return [...shelves.values()];
}

/** Articles posés directement sur une zone. */
export function listZoneItems(db, zoneId) {
  return db
    .prepare(
      `SELECT ${SLOT_ITEM_COLUMNS}
         FROM item_locations
         JOIN items ON items.id = item_locations.item_id
        WHERE item_locations.zone_id = ?
        ORDER BY items.reference`,
    )
    .all(zoneId)
    .map(toShelfItem);
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
  };
}

/** (Re)génère les étagères d'un rayonnage sans toucher à celles déjà occupées. */
export function syncRackShelves(db, rack) {
  const existing = db
    .prepare('SELECT id, shelf_index FROM shelves WHERE rack_id = ?')
    .all(rack.id);

  const obsolete = existing.filter((shelf) => shelf.shelf_index > rack.shelves_count);

  if (obsolete.length > 0) {
    const occupied = obsolete.filter((shelf) => shelfItemCount(db, shelf.id) > 0);
    if (occupied.length > 0) {
      const codes = occupied.map((shelf) => formatShelfCode(rack.code, shelf.shelf_index));
      throw conflict(
        `Impossible de réduire ce rayonnage : ${codes.length} étagère(s) encore occupée(s) — ${codes.join(', ')}. Déplacez d’abord ces articles.`,
        { codes },
      );
    }
    const remove = db.prepare('DELETE FROM shelves WHERE id = ?');
    for (const shelf of obsolete) remove.run(shelf.id);
  }

  const known = new Set(existing.map((shelf) => shelf.shelf_index));
  const insert = db.prepare('INSERT INTO shelves (rack_id, shelf_index) VALUES (?, ?)');
  for (let index = 1; index <= rack.shelves_count; index += 1) {
    if (!known.has(index)) insert.run(rack.id, index);
  }
}

export function shelfItemCount(db, shelfId) {
  return db
    .prepare('SELECT COUNT(*) AS total FROM item_locations WHERE shelf_id = ?')
    .get(shelfId).total;
}

/** Articles portés par un rayonnage (via ses étagères) ou par une zone. */
export function rackItemCount(db, rackId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM item_locations
         LEFT JOIN shelves ON shelves.id = item_locations.shelf_id
        WHERE COALESCE(shelves.rack_id, item_locations.zone_id) = ?`,
    )
    .get(rackId).total;
}

/**
 * Journalise une action sur un article. Les codes d'emplacement sont figés en
 * clair pour que l'historique reste lisible après suppression.
 */
export function recordMovement(db, { item, user, action, from = null, to = null }) {
  db.prepare(
    `INSERT INTO movements (
       item_id, item_reference, item_designation, user_id, user_first_name,
       action, from_code, to_code, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id ?? null,
    item.reference,
    item.designation ?? '',
    user.id,
    user.first_name,
    action,
    from?.code ?? null,
    to?.code ?? null,
    new Date().toISOString(),
  );
}
