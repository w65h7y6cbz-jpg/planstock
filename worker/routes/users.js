import { Hono } from 'hono';
import { badRequest, body, conflict, notFound, routeId } from '../lib/http.js';

/**
 * Prénoms des techniciens, leur code et leurs droits.
 *
 * `decorate` ne laisse jamais sortir `pin_hash` ni `pin_salt` : la liste des
 * prénoms est lisible sans rien prouver, et livrer l'empreinte d'un code à
 * 4 chiffres reviendrait à le livrer tout court.
 */
export const users = new Hono();

const decorate = ({ pin_hash, pin_salt, failed_attempts, locked_until, ...row }) => ({
  ...row,
  active: Boolean(row.active),
  has_pin: Boolean(pin_hash),
  can_move: Boolean(row.can_move),
  can_delete: Boolean(row.can_delete),
  can_admin: Boolean(row.can_admin),
  restrict_customers: Boolean(row.restrict_customers),
});

/** Droit lu depuis le corps : absent, on garde celui d'aujourd'hui. */
const readFlag = (value, fallback) => (value === undefined ? fallback : value ? 1 : 0);

users.get('/', async (c) => {
  const db = c.get('db');
  const includeInactive = c.req.query('all') === '1';
  const rows = await db.all(
    `SELECT * FROM users
      ${includeInactive ? '' : 'WHERE active = 1'}
      ORDER BY first_name COLLATE NOCASE`,
  );
  return c.json(rows.map(decorate));
});

users.post('/', async (c) => {
  const db = c.get('db');
  const payload = await body(c);

  const firstName = String(payload.first_name ?? '').trim();
  if (!firstName) throw badRequest('Le prénom est obligatoire.');
  if (firstName.length > 40) throw badRequest('Le prénom ne doit pas dépasser 40 caractères.');

  const existing = await db.get(
    'SELECT id, active FROM users WHERE first_name = ? COLLATE NOCASE',
    firstName,
  );
  if (existing) throw conflict(`Le prénom « ${firstName} » existe déjà dans la liste.`);

  const { lastInsertRowid } = await db.run(
    'INSERT INTO users (first_name, active, created_at) VALUES (?, 1, ?)',
    firstName,
    new Date().toISOString(),
  );
  const user = await db.get('SELECT * FROM users WHERE id = ?', lastInsertRowid);
  return c.json(decorate(user), 201);
});

users.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);

  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user) throw notFound('Utilisateur introuvable.');

  const firstName =
    payload.first_name === undefined ? user.first_name : String(payload.first_name).trim();
  if (!firstName) throw badRequest('Le prénom est obligatoire.');

  const active = payload.active === undefined ? user.active : payload.active ? 1 : 0;
  const next = {
    can_move: readFlag(payload.can_move, user.can_move),
    can_delete: readFlag(payload.can_delete, user.can_delete),
    can_admin: readFlag(payload.can_admin, user.can_admin),
    restrict_customers: readFlag(payload.restrict_customers, user.restrict_customers),
  };

  const clash = await db.get(
    'SELECT id FROM users WHERE first_name = ? COLLATE NOCASE AND id <> ?',
    firstName,
    id,
  );
  if (clash) throw conflict(`Le prénom « ${firstName} » existe déjà dans la liste.`);

  await db.run(
    `UPDATE users SET first_name = ?, active = ?, can_move = ?, can_delete = ?,
                      can_admin = ?, restrict_customers = ?
      WHERE id = ?`,
    firstName,
    active,
    next.can_move,
    next.can_delete,
    next.can_admin,
    next.restrict_customers,
    id,
  );

  // Stocks à part autorisés, quand la liste est fournie. On remplace en bloc :
  // un ajout partiel laisserait des droits qu'on croyait avoir retirés.
  if (Array.isArray(payload.customer_ids)) {
    await db.batch([
      db.stmt('DELETE FROM user_customers WHERE user_id = ?', id),
      ...payload.customer_ids
        .map(Number)
        .filter((customerId) => Number.isInteger(customerId) && customerId > 0)
        .map((customerId) =>
          db.stmt(
            'INSERT INTO user_customers (user_id, customer_id) VALUES (?, ?)',
            id,
            customerId,
          ),
        ),
    ]);
  }

  return c.json(decorate(await db.get('SELECT * FROM users WHERE id = ?', id)));
});
