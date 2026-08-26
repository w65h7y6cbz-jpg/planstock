import { Router } from 'express';
import { badRequest, conflict, routeId, requireUser } from '../lib/http.js';
import { cleanDisplayReference, normalizeReference } from '../lib/reference.js';
import {
  findItemById,
  findItemByReference,
  findShelf,
  findZone,
  listItems,
  recordMovement,
} from '../lib/store.js';

const KINDS = ['physical', 'service', 'other_site'];
const PREFIX_MIN_LENGTH = 3;
const PREFIX_MAX_RESULTS = 8;

function readKind(value, fallback = 'physical') {
  if (value === undefined || value === null || value === '') return fallback;
  const kind = String(value);
  if (!KINDS.includes(kind)) {
    throw badRequest('Type d’article invalide (attendu : Physique, Service ou Autre site).');
  }
  return kind;
}

/** Un article Service ou Autre site n'a jamais d'emplacement physique. */
function isPhysical(kind) {
  return kind === 'physical';
}

/** Famille Sage (facultative) : conservée telle quelle, jamais interprétée. */
function readFamily(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  return String(value).trim() || null;
}

function readId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`${field} invalide.`);
  return id;
}

/**
 * Emplacement demandé : une étagère (`shelf_id`) ou une zone (`zone_id`),
 * jamais les deux. `undefined` si le corps n'en mentionne aucun.
 */
function readLocation(db, body) {
  const shelfId = readId(body.shelf_id, 'Étagère');
  const zoneId = readId(body.zone_id, 'Zone');

  if (shelfId && zoneId) {
    throw badRequest('Choisissez soit une étagère, soit une zone, pas les deux.');
  }
  if (shelfId) return findShelf(db, shelfId);
  if (zoneId) return findZone(db, zoneId);
  return body.shelf_id === undefined && body.zone_id === undefined ? undefined : null;
}

function locationColumns(location) {
  return {
    shelf_id: location?.kind === 'shelf' ? location.shelf_id : null,
    zone_id: location?.kind === 'zone' ? location.zone_id : null,
  };
}

export function createItemsRouter(db) {
  const router = Router();

  const insertLocation = () =>
    db.prepare('INSERT INTO item_locations (item_id, shelf_id, zone_id) VALUES (?, ?, ?)');

  router.get('/', (req, res) => {
    const search = normalizeReference(req.query.q ?? '');
    res.json(listItems(db, { search: search || null }));
  });

  /**
   * Recherche depuis le bon de préparation : correspondance exacte d'abord,
   * puis suggestions par préfixe (à partir de 3 caractères, 8 maximum).
   */
  router.get('/search', (req, res) => {
    const raw = String(req.query.q ?? '');
    const normalized = normalizeReference(raw);

    if (!normalized) {
      res.json({ query: raw, normalized: '', exact: null, matches: [] });
      return;
    }

    const exact = findItemByReference(db, normalized);
    const matches =
      normalized.length >= PREFIX_MIN_LENGTH
        ? listItems(db, { search: normalized, limit: PREFIX_MAX_RESULTS })
        : exact
          ? [exact]
          : [];

    res.json({ query: raw, normalized, exact, matches });
  });

  router.get('/:id', (req, res) => {
    res.json(findItemById(db, routeId(req)));
  });

  router.post('/', (req, res) => {
    const user = requireUser(db, req);
    const body = req.body ?? {};

    const display = cleanDisplayReference(body.reference);
    const reference = normalizeReference(display);
    if (!reference) throw badRequest('La référence est obligatoire.');

    if (findItemByReference(db, reference)) {
      throw conflict(`La référence « ${display} » existe déjà.`);
    }

    const kind = readKind(body.kind);
    const requested = readLocation(db, body);
    const location = requested ?? null;

    if (isPhysical(kind) && !location) {
      throw badRequest('Un article physique doit être rangé sur une étagère ou une zone.');
    }
    if (!isPhysical(kind) && location) {
      throw badRequest('Un article Service ou Autre site n’a pas d’emplacement physique.');
    }

    const now = new Date().toISOString();

    const item = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO items (reference, reference_display, designation, kind,
                              family_code, family_label, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reference,
          display,
          String(body.designation ?? '').trim(),
          kind,
          readFamily(body.family_code),
          readFamily(body.family_label),
          now,
          now,
        );

      const created = findItemById(db, Number(info.lastInsertRowid));
      if (location) {
        const columns = locationColumns(location);
        insertLocation().run(created.id, columns.shelf_id, columns.zone_id);
      }
      recordMovement(db, { item: created, user, action: 'create', to: location });
      return findItemById(db, created.id);
    })();

    res.status(201).json(item);
  });

  router.patch('/:id', (req, res) => {
    const user = requireUser(db, req);
    const id = routeId(req);
    const item = findItemById(db, id);
    const body = req.body ?? {};

    const display =
      body.reference === undefined ? item.reference_display : cleanDisplayReference(body.reference);
    const reference = normalizeReference(display);
    if (!reference) throw badRequest('La référence est obligatoire.');

    if (reference !== item.reference) {
      const clash = findItemByReference(db, reference);
      if (clash && clash.id !== id) throw conflict(`La référence « ${display} » existe déjà.`);
    }

    const kind = readKind(body.kind, item.kind);
    const designation =
      body.designation === undefined ? item.designation : String(body.designation).trim();
    const familyCode = readFamily(body.family_code, item.family_code);
    const familyLabel = readFamily(body.family_label, item.family_label);

    const current = item.locations[0] ?? null;
    const requested = readLocation(db, body);
    let target = current;

    if (!isPhysical(kind)) {
      target = null;
    } else if (requested !== undefined) {
      if (!requested) {
        throw badRequest('Un article physique doit être rangé sur une étagère ou une zone.');
      }
      target = requested;
    } else if (!current) {
      throw badRequest('Un article physique doit être rangé sur une étagère ou une zone.');
    }

    const locationChanged = (current?.code ?? null) !== (target?.code ?? null);
    const fieldsChanged =
      reference !== item.reference ||
      designation !== item.designation ||
      kind !== item.kind ||
      familyCode !== item.family_code ||
      familyLabel !== item.family_label;

    const updated = db.transaction(() => {
      db.prepare(
        `UPDATE items SET reference = ?, reference_display = ?, designation = ?, kind = ?,
                          family_code = ?, family_label = ?, updated_at = ?
          WHERE id = ?`,
      ).run(
        reference,
        display,
        designation,
        kind,
        familyCode,
        familyLabel,
        new Date().toISOString(),
        id,
      );

      if (locationChanged) {
        db.prepare('DELETE FROM item_locations WHERE item_id = ?').run(id);
        if (target) {
          const columns = locationColumns(target);
          insertLocation().run(id, columns.shelf_id, columns.zone_id);
        }
      }

      const next = findItemById(db, id);
      if (fieldsChanged) recordMovement(db, { item: next, user, action: 'update' });
      if (locationChanged) {
        recordMovement(db, { item: next, user, action: 'move', from: current, to: target });
      }
      return next;
    })();

    res.json(updated);
  });

  /** Déplacement d'un article (glisser-déposer d'une bande à l'autre, ou vers une zone). */
  router.put('/:id/location', (req, res) => {
    const user = requireUser(db, req);
    const id = routeId(req);
    const item = findItemById(db, id);

    if (!isPhysical(item.kind)) {
      throw badRequest('Un article Service ou Autre site n’a pas d’emplacement physique.');
    }

    const target = readLocation(db, req.body ?? {});
    if (!target) throw badRequest('Choisissez une étagère ou une zone de destination.');

    const current = item.locations[0] ?? null;
    if (current?.code === target.code) {
      res.json(item);
      return;
    }

    const updated = db.transaction(() => {
      db.prepare('DELETE FROM item_locations WHERE item_id = ?').run(id);
      const columns = locationColumns(target);
      insertLocation().run(id, columns.shelf_id, columns.zone_id);
      db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);

      const next = findItemById(db, id);
      recordMovement(db, { item: next, user, action: 'move', from: current, to: target });
      return next;
    })();

    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    const user = requireUser(db, req);
    const id = routeId(req);
    const item = findItemById(db, id);

    db.transaction(() => {
      recordMovement(db, { item, user, action: 'delete', from: item.locations[0] ?? null });
      db.prepare('DELETE FROM items WHERE id = ?').run(id);
    })();

    res.json({ deleted: true, id, reference: item.reference_display });
  });

  return router;
}

export { KINDS };
