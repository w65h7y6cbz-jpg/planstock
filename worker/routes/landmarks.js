import { Hono } from 'hono';
import { badRequest, body, notFound, routeId } from '../lib/http.js';
import { findSite } from '../lib/store.js';

/**
 * Repères du local : porte d'entrée, comptoir/établi. Ils sont dessinés sur le
 * plan pour se situer et ne stockent jamais d'article — d'où une table à part
 * plutôt qu'un troisième `kind` de rayonnage.
 */

const KINDS = ['door', 'bench'];
const DEFAULT_LABELS = { door: 'Entrée', bench: 'Établi' };

function readKind(value) {
  const kind = String(value ?? '');
  if (!KINDS.includes(kind)) {
    throw badRequest('Type de repère invalide (attendu : porte ou établi).');
  }
  return kind;
}

function readPercent(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw badRequest(`${field} doit être un pourcentage du plan entre 0 et 100.`);
  }
  return Math.round(number * 100) / 100;
}

export const landmarks = new Hono();

landmarks.get('/', async (c) => {
  const db = c.get('db');
  const siteId = Number(c.req.query('site_id'));
  const rows = Number.isInteger(siteId)
    ? await db.all('SELECT * FROM landmarks WHERE site_id = ? ORDER BY id', siteId)
    : await db.all('SELECT * FROM landmarks ORDER BY site_id, id');
  return c.json(rows);
});

landmarks.post('/', async (c) => {
  const db = c.get('db');
  const payload = await body(c);
  const site = await findSite(db, Number(payload.site_id));
  const kind = readKind(payload.kind);
  const isDoor = kind === 'door';

  const { lastInsertRowid } = await db.run(
    `INSERT INTO landmarks (site_id, kind, label, x, y, width, height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    site.id,
    kind,
    String(payload.label ?? DEFAULT_LABELS[kind]).trim(),
    readPercent(payload.x, 4, 'La position X'),
    readPercent(payload.y, 4, 'La position Y'),
    readPercent(payload.width, isDoor ? 8 : 14, 'La largeur'),
    readPercent(payload.height, isDoor ? 3 : 6, 'La hauteur'),
    new Date().toISOString(),
  );

  return c.json(await db.get('SELECT * FROM landmarks WHERE id = ?', lastInsertRowid), 201);
});

landmarks.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);

  const landmark = await db.get('SELECT * FROM landmarks WHERE id = ?', id);
  if (!landmark) throw notFound('Repère introuvable.');

  await db.run(
    'UPDATE landmarks SET label = ?, x = ?, y = ?, width = ?, height = ? WHERE id = ?',
    payload.label === undefined ? landmark.label : String(payload.label).trim(),
    readPercent(payload.x, landmark.x, 'La position X'),
    readPercent(payload.y, landmark.y, 'La position Y'),
    readPercent(payload.width, landmark.width, 'La largeur'),
    readPercent(payload.height, landmark.height, 'La hauteur'),
    id,
  );

  return c.json(await db.get('SELECT * FROM landmarks WHERE id = ?', id));
});

landmarks.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const landmark = await db.get('SELECT * FROM landmarks WHERE id = ?', id);
  if (!landmark) throw notFound('Repère introuvable.');

  await db.run('DELETE FROM landmarks WHERE id = ?', id);
  return c.json({ deleted: true, id });
});
