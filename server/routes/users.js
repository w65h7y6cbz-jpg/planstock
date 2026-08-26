import { Router } from 'express';
import { badRequest, conflict, notFound, routeId } from '../lib/http.js';

/** Prénoms des techniciens. Pas de mot de passe, pas de rôle : juste une liste. */
export function createUsersRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const includeInactive = req.query.all === '1';
    const rows = db
      .prepare(
        `SELECT id, first_name, active, created_at FROM users
          ${includeInactive ? '' : 'WHERE active = 1'}
          ORDER BY first_name COLLATE NOCASE`,
      )
      .all();
    res.json(rows.map((row) => ({ ...row, active: Boolean(row.active) })));
  });

  router.post('/', (req, res) => {
    const firstName = String(req.body?.first_name ?? '').trim();
    if (!firstName) throw badRequest('Le prénom est obligatoire.');
    if (firstName.length > 40) throw badRequest('Le prénom ne doit pas dépasser 40 caractères.');

    const existing = db
      .prepare('SELECT id, active FROM users WHERE first_name = ? COLLATE NOCASE')
      .get(firstName);
    if (existing) {
      throw conflict(`Le prénom « ${firstName} » existe déjà dans la liste.`);
    }

    const info = db
      .prepare('INSERT INTO users (first_name, active, created_at) VALUES (?, 1, ?)')
      .run(firstName, new Date().toISOString());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ...user, active: Boolean(user.active) });
  });

  router.patch('/:id', (req, res) => {
    const id = routeId(req);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) throw notFound('Utilisateur introuvable.');

    const firstName =
      req.body?.first_name === undefined ? user.first_name : String(req.body.first_name).trim();
    if (!firstName) throw badRequest('Le prénom est obligatoire.');

    const active = req.body?.active === undefined ? user.active : req.body.active ? 1 : 0;

    const clash = db
      .prepare('SELECT id FROM users WHERE first_name = ? COLLATE NOCASE AND id <> ?')
      .get(firstName, id);
    if (clash) throw conflict(`Le prénom « ${firstName} » existe déjà dans la liste.`);

    db.prepare('UPDATE users SET first_name = ?, active = ? WHERE id = ?').run(
      firstName,
      active,
      id,
    );
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({ ...updated, active: Boolean(updated.active) });
  });

  return router;
}
