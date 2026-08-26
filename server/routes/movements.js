import { Router } from 'express';
import { normalizeReference } from '../lib/reference.js';
import { escapeLike } from '../lib/store.js';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/** Historique des mouvements, filtrable par référence. */
export function createMovementsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const reference = normalizeReference(req.query.reference ?? '');
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

    const where = reference ? "WHERE item_reference LIKE ? ESCAPE '\\'" : '';
    const params = reference ? [`${escapeLike(reference)}%`] : [];

    const rows = db
      .prepare(
        `SELECT id, item_id, item_reference, item_designation, user_id, user_first_name,
                action, from_slot_id, from_slot_code, to_slot_id, to_slot_code, created_at
           FROM movements ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
      )
      .all(...params, limit);

    res.json(rows);
  });

  return router;
}
