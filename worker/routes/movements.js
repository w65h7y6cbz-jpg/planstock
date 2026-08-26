import { Hono } from 'hono';
import { normalizeReference } from '../lib/reference.js';
import { escapeLike } from '../lib/store.js';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/** Historique des mouvements, filtrable par référence. */
export const movements = new Hono();

movements.get('/', async (c) => {
  const db = c.get('db');
  const reference = normalizeReference(c.req.query('reference') ?? '');
  const limit = Math.min(Number(c.req.query('limit')) || DEFAULT_LIMIT, MAX_LIMIT);

  const where = reference ? "WHERE item_reference LIKE ? ESCAPE '\\'" : '';
  const params = reference ? [`${escapeLike(reference)}%`] : [];

  return c.json(
    await db.all(
      `SELECT id, item_id, item_reference, item_designation, user_id, user_first_name,
              action, from_code, to_code, created_at
         FROM movements ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      ...params,
      limit,
    ),
  );
});
