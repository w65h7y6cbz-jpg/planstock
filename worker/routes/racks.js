import { Hono } from 'hono';
import { badRequest, body, conflict, notFound, routeId } from '../lib/http.js';
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

/** Les numéros repartent de 1 dans chaque local. */
async function nextCode(db, siteId, kind) {
  const row = await db.get(
    'SELECT MAX(code) AS code FROM racks WHERE site_id = ? AND kind = ?',
    siteId,
    kind,
  );
  const max = row?.code ?? 0;
  if (max >= 99) {
    throw conflict(
      kind === 'zone'
        ? 'Le nombre maximal de zones (99) est atteint dans ce local.'
        : 'Le nombre maximal de rayonnages (99) est atteint dans ce local.',
    );
  }
  return max + 1;
}

/** Rayonnage complet : ses étagères, ou ses articles s'il s'agit d'une zone. */
async function rackDetail(db, rack) {
  const decorated = decorateRack(rack, await rackItemCount(db, rack.id));
  return rack.kind === 'zone'
    ? { ...decorated, shelves: [], items: await listZoneItems(db, rack.id) }
    : { ...decorated, shelves: await listRackShelves(db, rack.id), items: [] };
}

/** Décore une liste de rayonnages avec leur nombre d'articles. */
async function decorateAll(db, rows) {
  const decorated = [];
  for (const row of rows) decorated.push(decorateRack(row, await rackItemCount(db, row.id)));
  return decorated;
}

export const racks = new Hono();

/** `?site_id=` restreint au local demandé ; sans lui, tous les locaux. */
racks.get('/', async (c) => {
  const db = c.get('db');
  const siteId = Number(c.req.query('site_id'));
  const rows = Number.isInteger(siteId)
    ? await db.all('SELECT * FROM racks WHERE site_id = ? ORDER BY kind, code', siteId)
    : await db.all('SELECT * FROM racks ORDER BY site_id, kind, code');
  return c.json(await decorateAll(db, rows));
});

racks.get('/:id', async (c) => {
  const db = c.get('db');
  const rack = await db.get('SELECT * FROM racks WHERE id = ?', routeId(c));
  if (!rack) throw notFound('Emplacement introuvable.');
  return c.json(await rackDetail(db, rack));
});

racks.get('/:id/shelves', async (c) => c.json(await listRackShelves(c.get('db'), routeId(c))));

racks.post('/', async (c) => {
  const db = c.get('db');
  const payload = await body(c);
  const site = await findSite(db, Number(payload.site_id));
  const kind = readKind(payload.kind);

  // Une zone (pile au sol, palette, table…) n'a aucune étagère.
  const shelvesCount =
    kind === 'zone'
      ? 0
      : readInteger(payload.shelves_count ?? DEFAULT_SHELVES, {
          field: 'Le nombre d’étagères',
          min: 1,
          max: MAX_SHELVES,
        });

  const code =
    payload.code === undefined || payload.code === null || payload.code === ''
      ? await nextCode(db, site.id, kind)
      : readInteger(payload.code, { field: 'Le numéro d’emplacement', min: 1, max: 99 });

  const taken = await db.get(
    'SELECT id FROM racks WHERE site_id = ? AND kind = ? AND code = ?',
    site.id,
    kind,
    code,
  );
  if (taken) {
    throw conflict(`L’emplacement ${formatRackCode(code, kind)} existe déjà dans ${site.name}.`);
  }

  const { total } = await db.get('SELECT COUNT(*) AS total FROM racks WHERE site_id = ?', site.id);
  const placement = defaultPlacement(total);

  const { lastInsertRowid } = await db.run(
    `INSERT INTO racks (site_id, code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    site.id,
    code,
    kind,
    String(payload.label ?? '').trim(),
    String(payload.aisle ?? '').trim(),
    shelvesCount,
    readPercent(payload.x, placement.x, 'La position X'),
    readPercent(payload.y, placement.y, 'La position Y'),
    readPercent(payload.width, placement.width, 'La largeur'),
    readPercent(payload.height, placement.height, 'La hauteur'),
    payload.rotation === 90 ? 90 : 0,
    new Date().toISOString(),
  );

  const created = await db.get('SELECT * FROM racks WHERE id = ?', lastInsertRowid);
  if (kind === 'rack') await syncRackShelves(db, created);

  return c.json(await rackDetail(db, created), 201);
});

racks.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);

  const rack = await db.get('SELECT * FROM racks WHERE id = ?', id);
  if (!rack) throw notFound('Emplacement introuvable.');

  if (payload.kind !== undefined && readKind(payload.kind) !== rack.kind) {
    throw badRequest('Un rayonnage ne peut pas devenir une zone : supprimez-le et créez la zone.');
  }

  const next = {
    code:
      payload.code === undefined
        ? rack.code
        : readInteger(payload.code, { field: 'Le numéro d’emplacement', min: 1, max: 99 }),
    label: payload.label === undefined ? rack.label : String(payload.label).trim(),
    aisle: payload.aisle === undefined ? rack.aisle : String(payload.aisle).trim(),
    shelves_count:
      rack.kind === 'zone'
        ? 0
        : payload.shelves_count === undefined
          ? rack.shelves_count
          : readInteger(payload.shelves_count, {
              field: 'Le nombre d’étagères',
              min: 1,
              max: MAX_SHELVES,
            }),
    x: readPercent(payload.x, rack.x, 'La position X'),
    y: readPercent(payload.y, rack.y, 'La position Y'),
    width: readPercent(payload.width, rack.width, 'La largeur'),
    height: readPercent(payload.height, rack.height, 'La hauteur'),
    rotation: payload.rotation === undefined ? rack.rotation : payload.rotation === 90 ? 90 : 0,
  };

  if (next.code !== rack.code) {
    const clash = await db.get(
      'SELECT id FROM racks WHERE site_id = ? AND kind = ? AND code = ? AND id <> ?',
      rack.site_id,
      rack.kind,
      next.code,
      id,
    );
    if (clash) {
      throw conflict(
        `L’emplacement ${formatRackCode(next.code, rack.kind)} existe déjà dans ce local.`,
      );
    }
  }

  await db.run(
    `UPDATE racks SET code = ?, label = ?, aisle = ?, shelves_count = ?,
                      x = ?, y = ?, width = ?, height = ?, rotation = ?
      WHERE id = ?`,
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

  const updated = await db.get('SELECT * FROM racks WHERE id = ?', id);
  if (updated.kind === 'rack') await syncRackShelves(db, updated);

  return c.json(await rackDetail(db, await db.get('SELECT * FROM racks WHERE id = ?', id)));
});

racks.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);

  const rack = await db.get('SELECT * FROM racks WHERE id = ?', id);
  if (!rack) throw notFound('Emplacement introuvable.');

  const items = await rackItemCount(db, id);
  if (items > 0) {
    throw conflict(
      `${formatRackCode(rack.code, rack.kind)} contient encore ${items} article(s). Déplacez-les avant de le supprimer.`,
    );
  }

  await db.run('DELETE FROM racks WHERE id = ?', id);
  return c.json({ deleted: true, id });
});
