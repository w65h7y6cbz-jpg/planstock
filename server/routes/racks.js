import { Router } from 'express';
import { badRequest, conflict, notFound, routeId } from '../lib/http.js';
import { formatRackCode } from '../lib/locationCode.js';
import { listRackSlots, rackItemCount, syncRackSlots } from '../lib/store.js';

const MAX_SHELVES = 20;
const MAX_SLOTS = 20;

function decorateRack(row, itemCount) {
  return {
    ...row,
    rack_code: formatRackCode(row.code),
    slots_total: row.shelves_count * row.slots_per_shelf,
    items_count: itemCount,
  };
}

function readInteger(value, { field, min, max }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`${field} doit être un nombre entier entre ${min} et ${max}.`);
  }
  return number;
}

function readPercent(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw badRequest(`${field} doit être un pourcentage du plan entre 0 et 100.`);
  }
  return Math.round(number * 100) / 100;
}

/** Position par défaut : rangées de 4 rectangles, l'utilisateur les déplace ensuite. */
function defaultPlacement(index) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: Math.min(4 + column * 24, 82),
    y: Math.min(6 + row * 16, 88),
    width: 18,
    height: 10,
  };
}

export function createRacksRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM racks ORDER BY code').all();
    res.json(rows.map((row) => decorateRack(row, rackItemCount(db, row.id))));
  });

  router.get('/:id', (req, res) => {
    const id = routeId(req);
    const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
    if (!rack) throw notFound('Rayonnage introuvable.');
    res.json({
      ...decorateRack(rack, rackItemCount(db, rack.id)),
      slots: listRackSlots(db, rack.id),
    });
  });

  router.get('/:id/slots', (req, res) => {
    res.json(listRackSlots(db, routeId(req)));
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const shelvesCount = readInteger(body.shelves_count, {
      field: 'Le nombre d’étagères',
      min: 1,
      max: MAX_SHELVES,
    });
    const slotsPerShelf = readInteger(body.slots_per_shelf, {
      field: 'Le nombre de cases par étagère',
      min: 1,
      max: MAX_SLOTS,
    });

    const code =
      body.code === undefined || body.code === null || body.code === ''
        ? nextRackCode(db)
        : readInteger(body.code, { field: 'Le numéro de rayonnage', min: 1, max: 99 });

    if (db.prepare('SELECT id FROM racks WHERE code = ?').get(code)) {
      throw conflict(`Le rayonnage ${formatRackCode(code)} existe déjà.`);
    }

    const count = db.prepare('SELECT COUNT(*) AS total FROM racks').get().total;
    const placement = defaultPlacement(count);

    const created = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO racks (code, label, shelves_count, slots_per_shelf, x, y, width, height, rotation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          code,
          String(body.label ?? '').trim(),
          shelvesCount,
          slotsPerShelf,
          readPercent(body.x, placement.x, 'La position X'),
          readPercent(body.y, placement.y, 'La position Y'),
          readPercent(body.width, placement.width, 'La largeur'),
          readPercent(body.height, placement.height, 'La hauteur'),
          body.rotation === 90 ? 90 : 0,
          new Date().toISOString(),
        );
      const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(info.lastInsertRowid);
      syncRackSlots(db, rack);
      return rack;
    })();

    res.status(201).json({ ...decorateRack(created, 0), slots: listRackSlots(db, created.id) });
  });

  router.patch('/:id', (req, res) => {
    const id = routeId(req);
    const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
    if (!rack) throw notFound('Rayonnage introuvable.');

    const body = req.body ?? {};
    const next = {
      code:
        body.code === undefined
          ? rack.code
          : readInteger(body.code, { field: 'Le numéro de rayonnage', min: 1, max: 99 }),
      label: body.label === undefined ? rack.label : String(body.label).trim(),
      shelves_count:
        body.shelves_count === undefined
          ? rack.shelves_count
          : readInteger(body.shelves_count, {
              field: 'Le nombre d’étagères',
              min: 1,
              max: MAX_SHELVES,
            }),
      slots_per_shelf:
        body.slots_per_shelf === undefined
          ? rack.slots_per_shelf
          : readInteger(body.slots_per_shelf, {
              field: 'Le nombre de cases par étagère',
              min: 1,
              max: MAX_SLOTS,
            }),
      x: readPercent(body.x, rack.x, 'La position X'),
      y: readPercent(body.y, rack.y, 'La position Y'),
      width: readPercent(body.width, rack.width, 'La largeur'),
      height: readPercent(body.height, rack.height, 'La hauteur'),
      rotation: body.rotation === undefined ? rack.rotation : body.rotation === 90 ? 90 : 0,
    };

    if (next.code !== rack.code) {
      const clash = db.prepare('SELECT id FROM racks WHERE code = ? AND id <> ?').get(next.code, id);
      if (clash) throw conflict(`Le rayonnage ${formatRackCode(next.code)} existe déjà.`);
    }

    const updated = db.transaction(() => {
      db.prepare(
        `UPDATE racks SET code = ?, label = ?, shelves_count = ?, slots_per_shelf = ?,
                          x = ?, y = ?, width = ?, height = ?, rotation = ?
          WHERE id = ?`,
      ).run(
        next.code,
        next.label,
        next.shelves_count,
        next.slots_per_shelf,
        next.x,
        next.y,
        next.width,
        next.height,
        next.rotation,
        id,
      );
      const row = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
      syncRackSlots(db, row);
      return row;
    })();

    res.json({
      ...decorateRack(updated, rackItemCount(db, id)),
      slots: listRackSlots(db, id),
    });
  });

  router.delete('/:id', (req, res) => {
    const id = routeId(req);
    const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
    if (!rack) throw notFound('Rayonnage introuvable.');

    const items = rackItemCount(db, id);
    if (items > 0) {
      throw conflict(
        `Le rayonnage ${formatRackCode(rack.code)} contient encore ${items} article(s). Déplacez-les avant de le supprimer.`,
      );
    }

    db.prepare('DELETE FROM racks WHERE id = ?').run(id);
    res.json({ deleted: true, id });
  });

  return router;
}

function nextRackCode(db) {
  const max = db.prepare('SELECT MAX(code) AS code FROM racks').get().code ?? 0;
  if (max >= 99) throw conflict('Le nombre maximal de rayonnages (99) est atteint.');
  return max + 1;
}
