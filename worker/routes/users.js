import { Hono } from 'hono';
import { badRequest, body, conflict, notFound, routeId } from '../lib/http.js';

/** Prénoms des techniciens. Pas de mot de passe, pas de rôle : juste une liste. */
export const users = new Hono();

const decorate = (row) => ({ ...row, active: Boolean(row.active) });

users.get('/', async (c) => {
  const db = c.get('db');
  const includeInactive = c.req.query('all') === '1';
  const rows = await db.all(
    `SELECT id, first_name, active, created_at FROM users
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

  const clash = await db.get(
    'SELECT id FROM users WHERE first_name = ? COLLATE NOCASE AND id <> ?',
    firstName,
    id,
  );
  if (clash) throw conflict(`Le prénom « ${firstName} » existe déjà dans la liste.`);

  await db.run('UPDATE users SET first_name = ?, active = ? WHERE id = ?', firstName, active, id);
  return c.json(decorate(await db.get('SELECT * FROM users WHERE id = ?', id)));
});
