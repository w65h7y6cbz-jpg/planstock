import { formatLocationCode, formatSlotShortCode } from './locationCode.js';
import { conflict, notFound } from './http.js';

const ITEM_COLUMNS = `
  items.id, items.reference, items.reference_display, items.designation,
  items.kind, items.family_code, items.family_label, items.created_at, items.updated_at
`;

const LOCATION_QUERY = `
  SELECT item_locations.item_id,
         slots.id   AS slot_id,
         slots.shelf_index,
         slots.slot_index,
         racks.id   AS rack_id,
         racks.code AS rack_code,
         racks.label AS rack_label
    FROM item_locations
    JOIN slots ON slots.id = item_locations.slot_id
    JOIN racks ON racks.id = slots.rack_id
   WHERE item_locations.item_id IN (SELECT value FROM json_each(?))
   ORDER BY racks.code, slots.shelf_index, slots.slot_index
`;

/** Emplacement enrichi de ses codes calculés. */
export function decorateLocation(row) {
  return {
    slot_id: row.slot_id,
    rack_id: row.rack_id,
    rack_code: row.rack_code,
    rack_label: row.rack_label,
    shelf_index: row.shelf_index,
    slot_index: row.slot_index,
    short_code: formatSlotShortCode(row.shelf_index, row.slot_index),
    code: formatLocationCode(row.rack_code, row.shelf_index, row.slot_index),
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
    sql += ' WHERE items.reference LIKE ?';
    params.push(`${escapeLike(search)}%`);
    sql += " ESCAPE '\\'";
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

/** Case avec son rayonnage et son code complet, ou 404. */
export function findSlot(db, slotId) {
  const row = db
    .prepare(
      `SELECT slots.id AS slot_id, slots.shelf_index, slots.slot_index,
              racks.id AS rack_id, racks.code AS rack_code, racks.label AS rack_label
         FROM slots JOIN racks ON racks.id = slots.rack_id
        WHERE slots.id = ?`,
    )
    .get(slotId);
  if (!row) throw notFound('Emplacement introuvable.');
  return decorateLocation(row);
}

/** Cases d'un rayonnage, avec les articles qu'elles contiennent. */
export function listRackSlots(db, rackId) {
  const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(rackId);
  if (!rack) throw notFound('Rayonnage introuvable.');

  const rows = db
    .prepare(
      `SELECT slots.id, slots.shelf_index, slots.slot_index,
              items.id AS item_id, items.reference, items.reference_display,
              items.designation, items.kind, items.family_code, items.family_label
         FROM slots
         LEFT JOIN item_locations ON item_locations.slot_id = slots.id
         LEFT JOIN items ON items.id = item_locations.item_id
        WHERE slots.rack_id = ?
        ORDER BY slots.shelf_index, slots.slot_index, items.reference`,
    )
    .all(rackId);

  const slots = new Map();
  for (const row of rows) {
    if (!slots.has(row.id)) {
      slots.set(row.id, {
        id: row.id,
        rack_id: rack.id,
        rack_code: rack.code,
        shelf_index: row.shelf_index,
        slot_index: row.slot_index,
        short_code: formatSlotShortCode(row.shelf_index, row.slot_index),
        code: formatLocationCode(rack.code, row.shelf_index, row.slot_index),
        items: [],
      });
    }
    if (row.item_id) {
      slots.get(row.id).items.push({
        id: row.item_id,
        reference: row.reference,
        reference_display: row.reference_display,
        designation: row.designation,
        kind: row.kind,
        family_code: row.family_code,
        family_label: row.family_label,
      });
    }
  }
  return [...slots.values()];
}

/** (Re)génère les cases d'un rayonnage sans toucher à celles déjà occupées. */
export function syncRackSlots(db, rack) {
  const existing = db
    .prepare('SELECT id, shelf_index, slot_index FROM slots WHERE rack_id = ?')
    .all(rack.id);

  const obsolete = existing.filter(
    (slot) => slot.shelf_index > rack.shelves_count || slot.slot_index > rack.slots_per_shelf,
  );

  if (obsolete.length > 0) {
    const occupied = obsolete.filter((slot) => slotItemCount(db, slot.id) > 0);
    if (occupied.length > 0) {
      const codes = occupied.map((slot) =>
        formatLocationCode(rack.code, slot.shelf_index, slot.slot_index),
      );
      throw conflict(
        `Impossible de réduire ce rayonnage : ${codes.length} case(s) encore occupée(s) — ${codes.join(', ')}. Déplacez d’abord ces articles.`,
        { codes },
      );
    }
    const remove = db.prepare('DELETE FROM slots WHERE id = ?');
    for (const slot of obsolete) remove.run(slot.id);
  }

  const known = new Set(existing.map((slot) => `${slot.shelf_index}:${slot.slot_index}`));
  const insert = db.prepare(
    'INSERT INTO slots (rack_id, shelf_index, slot_index) VALUES (?, ?, ?)',
  );
  for (let shelf = 1; shelf <= rack.shelves_count; shelf += 1) {
    for (let slot = 1; slot <= rack.slots_per_shelf; slot += 1) {
      if (!known.has(`${shelf}:${slot}`)) insert.run(rack.id, shelf, slot);
    }
  }
}

export function slotItemCount(db, slotId) {
  return db
    .prepare('SELECT COUNT(*) AS total FROM item_locations WHERE slot_id = ?')
    .get(slotId).total;
}

export function rackItemCount(db, rackId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM item_locations
         JOIN slots ON slots.id = item_locations.slot_id
        WHERE slots.rack_id = ?`,
    )
    .get(rackId).total;
}

/**
 * Journalise une action sur un article. Les codes d'emplacement sont figés en
 * clair pour que l'historique reste lisible après suppression.
 */
export function recordMovement(db, { item, user, action, fromSlot = null, toSlot = null }) {
  db.prepare(
    `INSERT INTO movements (
       item_id, item_reference, item_designation, user_id, user_first_name,
       action, from_slot_id, from_slot_code, to_slot_id, to_slot_code, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id ?? null,
    item.reference,
    item.designation ?? '',
    user.id,
    user.first_name,
    action,
    fromSlot?.slot_id ?? null,
    fromSlot?.code ?? null,
    toSlot?.slot_id ?? null,
    toSlot?.code ?? null,
    new Date().toISOString(),
  );
}
