import { Router } from 'express';
import { badRequest, notFound, routeId } from '../lib/http.js';
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

export function createLandmarksRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const siteId = Number(req.query.site_id);
    const rows = Number.isInteger(siteId)
      ? db.prepare('SELECT * FROM landmarks WHERE site_id = ? ORDER BY id').all(siteId)
      : db.prepare('SELECT * FROM landmarks ORDER BY site_id, id').all();
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const site = findSite(db, Number(body.site_id));
    const kind = readKind(body.kind);
    const isDoor = kind === 'door';

    const info = db
      .prepare(
        `INSERT INTO landmarks (site_id, kind, label, x, y, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        site.id,
        kind,
        String(body.label ?? DEFAULT_LABELS[kind]).trim(),
        readPercent(body.x, 4, 'La position X'),
        readPercent(body.y, 4, 'La position Y'),
        readPercent(body.width, isDoor ? 8 : 14, 'La largeur'),
        readPercent(body.height, isDoor ? 3 : 6, 'La hauteur'),
        new Date().toISOString(),
      );

    res.status(201).json(db.prepare('SELECT * FROM landmarks WHERE id = ?').get(info.lastInsertRowid));
  });

  router.patch('/:id', (req, res) => {
    const id = routeId(req);
    const landmark = db.prepare('SELECT * FROM landmarks WHERE id = ?').get(id);
    if (!landmark) throw notFound('Repère introuvable.');

    const body = req.body ?? {};
    db.prepare(
      'UPDATE landmarks SET label = ?, x = ?, y = ?, width = ?, height = ? WHERE id = ?',
    ).run(
      body.label === undefined ? landmark.label : String(body.label).trim(),
      readPercent(body.x, landmark.x, 'La position X'),
      readPercent(body.y, landmark.y, 'La position Y'),
      readPercent(body.width, landmark.width, 'La largeur'),
      readPercent(body.height, landmark.height, 'La hauteur'),
      id,
    );

    res.json(db.prepare('SELECT * FROM landmarks WHERE id = ?').get(id));
  });

  router.delete('/:id', (req, res) => {
    const id = routeId(req);
    const landmark = db.prepare('SELECT * FROM landmarks WHERE id = ?').get(id);
    if (!landmark) throw notFound('Repère introuvable.');
    db.prepare('DELETE FROM landmarks WHERE id = ?').run(id);
    res.json({ deleted: true, id });
  });

  return router;
}

export { KINDS as LANDMARK_KINDS };
