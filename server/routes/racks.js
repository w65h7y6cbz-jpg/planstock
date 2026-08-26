import { Router } from 'express';
import { badRequest, conflict, notFound, routeId } from '../lib/http.js';
import { formatRackCode } from '../lib/locationCode.js';
import {
  findSite,
  listRackShelves,
  listZoneItems,
  rackItemCount,
  syncRackShelves,
} from '../lib/store.js';

const MAX_SHELVES = 30;
const DEFAULT_SHELVES = 5;

function decorateRack(row, itemCount) {
  return {
    ...row,
    rack_code: formatRackCode(row.code, row.kind),
    is_zone: row.kind === 'zone',
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

function readKind(value, fallback = 'rack') {
  if (value === undefined || value === null || value === '') return fallback;
  if (value !== 'rack' && value !== 'zone') {
    throw badRequest('Type d’emplacement invalide (attendu : rayonnage ou zone).');
  }
  return value;
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

  /** Rayonnage complet : ses étagères, ou ses articles s'il s'agit d'une zone. */
  function rackDetail(rack) {
    const decorated = decorateRack(rack, rackItemCount(db, rack.id));
    return rack.kind === 'zone'
      ? { ...decorated, shelves: [], items: listZoneItems(db, rack.id) }
      : { ...decorated, shelves: listRackShelves(db, rack.id), items: [] };
  }

  /** `?site_id=` restreint au local demandé ; sans lui, tous les locaux. */
  router.get('/', (req, res) => {
    const siteId = Number(req.query.site_id);
    const rows = Number.isInteger(siteId)
      ? db.prepare('SELECT * FROM racks WHERE site_id = ? ORDER BY kind, code').all(siteId)
      : db.prepare('SELECT * FROM racks ORDER BY site_id, kind, code').all();
    res.json(rows.map((row) => decorateRack(row, rackItemCount(db, row.id))));
  });

  router.get('/:id', (req, res) => {
    const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(routeId(req));
    if (!rack) throw notFound('Emplacement introuvable.');
    res.json(rackDetail(rack));
  });

  router.get('/:id/shelves', (req, res) => {
    res.json(listRackShelves(db, routeId(req)));
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const site = findSite(db, Number(body.site_id));
    const kind = readKind(body.kind);

    // Une zone (pile au sol, palette, table…) n'a aucune étagère.
    const shelvesCount =
      kind === 'zone'
        ? 0
        : readInteger(body.shelves_count ?? DEFAULT_SHELVES, {
            field: 'Le nombre d’étagères',
            min: 1,
            max: MAX_SHELVES,
          });

    const code =
      body.code === undefined || body.code === null || body.code === ''
        ? nextCode(db, site.id, kind)
        : readInteger(body.code, { field: 'Le numéro d’emplacement', min: 1, max: 99 });

    if (
      db
        .prepare('SELECT id FROM racks WHERE site_id = ? AND kind = ? AND code = ?')
        .get(site.id, kind, code)
    ) {
      throw conflict(`L’emplacement ${formatRackCode(code, kind)} existe déjà dans ${site.name}.`);
    }

    const count = db.prepare('SELECT COUNT(*) AS total FROM racks WHERE site_id = ?').get(site.id)
      .total;
    const placement = defaultPlacement(count);

    const created = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          site.id,
          code,
          kind,
          String(body.label ?? '').trim(),
          String(body.aisle ?? '').trim(),
          shelvesCount,
          readPercent(body.x, placement.x, 'La position X'),
          readPercent(body.y, placement.y, 'La position Y'),
          readPercent(body.width, placement.width, 'La largeur'),
          readPercent(body.height, placement.height, 'La hauteur'),
          body.rotation === 90 ? 90 : 0,
          new Date().toISOString(),
        );
      const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(info.lastInsertRowid);
      if (kind === 'rack') syncRackShelves(db, rack);
      return rack;
    })();

    res.status(201).json(rackDetail(created));
  });

  router.patch('/:id', (req, res) => {
    const id = routeId(req);
    const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
    if (!rack) throw notFound('Emplacement introuvable.');

    const body = req.body ?? {};
    if (body.kind !== undefined && readKind(body.kind) !== rack.kind) {
      throw badRequest(
        'Un rayonnage ne peut pas devenir une zone : supprimez-le et créez la zone.',
      );
    }

    const next = {
      code:
        body.code === undefined
          ? rack.code
          : readInteger(body.code, { field: 'Le numéro d’emplacement', min: 1, max: 99 }),
      label: body.label === undefined ? rack.label : String(body.label).trim(),
      aisle: body.aisle === undefined ? rack.aisle : String(body.aisle).trim(),
      shelves_count:
        rack.kind === 'zone'
          ? 0
          : body.shelves_count === undefined
            ? rack.shelves_count
            : readInteger(body.shelves_count, {
                field: 'Le nombre d’étagères',
                min: 1,
                max: MAX_SHELVES,
              }),
      x: readPercent(body.x, rack.x, 'La position X'),
      y: readPercent(body.y, rack.y, 'La position Y'),
      width: readPercent(body.width, rack.width, 'La largeur'),
      height: readPercent(body.height, rack.height, 'La hauteur'),
      rotation: body.rotation === undefined ? rack.rotation : body.rotation === 90 ? 90 : 0,
    };

    if (next.code !== rack.code) {
      const clash = db
        .prepare('SELECT id FROM racks WHERE site_id = ? AND kind = ? AND code = ? AND id <> ?')
        .get(rack.site_id, rack.kind, next.code, id);
      if (clash) {
        throw conflict(
          `L’emplacement ${formatRackCode(next.code, rack.kind)} existe déjà dans ce local.`,
        );
      }
    }

    const updated = db.transaction(() => {
      db.prepare(
        `UPDATE racks SET code = ?, label = ?, aisle = ?, shelves_count = ?,
                          x = ?, y = ?, width = ?, height = ?, rotation = ?
          WHERE id = ?`,
      ).run(
        next.code,
        next.label,
        next.aisle,
        next.shelves_count,
        next.x,
        next.y,
        next.width,
        next.height,
        next.rotation,
        id,
      );
      const row = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
      if (row.kind === 'rack') syncRackShelves(db, row);
      return row;
    })();

    res.json(rackDetail(updated));
  });

  router.delete('/:id', (req, res) => {
    const id = routeId(req);
    const rack = db.prepare('SELECT * FROM racks WHERE id = ?').get(id);
    if (!rack) throw notFound('Emplacement introuvable.');

    const items = rackItemCount(db, id);
    if (items > 0) {
      throw conflict(
        `${formatRackCode(rack.code, rack.kind)} contient encore ${items} article(s). Déplacez-les avant de le supprimer.`,
      );
    }

    db.prepare('DELETE FROM racks WHERE id = ?').run(id);
    res.json({ deleted: true, id });
  });

  return router;
}

/** Les numéros repartent de 1 dans chaque local. */
function nextCode(db, siteId, kind) {
  const max =
    db
      .prepare('SELECT MAX(code) AS code FROM racks WHERE site_id = ? AND kind = ?')
      .get(siteId, kind).code ?? 0;
  if (max >= 99) {
    throw conflict(
      kind === 'zone'
        ? 'Le nombre maximal de zones (99) est atteint dans ce local.'
        : 'Le nombre maximal de rayonnages (99) est atteint dans ce local.',
    );
  }
  return max + 1;
}
