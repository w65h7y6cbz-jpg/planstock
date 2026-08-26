import { Hono } from 'hono';
import { badRequest, body, cookieValue, forbidden, notFound, routeId } from '../lib/http.js';
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  hasPin,
  issueSession,
  lockRemaining,
  newPinRecord,
  readPin,
  readSession,
  sessionCookie,
  verifyPin,
} from '../lib/identity.js';

/**
 * Ouverture de session : on prouve qui on est avec son code à 4 chiffres.
 *
 * Un prénom sans code entre sans rien saisir — c'est le comportement d'avant,
 * gardé pour que déployer cette version ne mette personne dehors. La liste des
 * prénoms dit lesquels sont protégés, pour que l'interface sache quoi demander.
 */
export const session = new Hono();

/** Utilisateur de la session en cours, ou `null`. */
async function currentUser(db, c) {
  const id = await readSession(db, cookieValue(c, SESSION_COOKIE));
  if (!id) return null;
  const user = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', id);
  return user ?? null;
}

/** Ce que l'interface a besoin de savoir : qui, et ce qu'il a le droit de faire. */
export async function describeUser(db, user) {
  if (!user) return null;
  const allowed = await db.all(
    'SELECT customer_id FROM user_customers WHERE user_id = ?',
    user.id,
  );
  return {
    id: user.id,
    first_name: user.first_name,
    active: Boolean(user.active),
    has_pin: hasPin(user),
    can_move: Boolean(user.can_move),
    can_delete: Boolean(user.can_delete),
    can_admin: Boolean(user.can_admin),
    restrict_customers: Boolean(user.restrict_customers),
    /** Vide et `restrict_customers` faux = tous les stocks. */
    customer_ids: allowed.map((row) => row.customer_id),
    created_at: user.created_at,
  };
}

session.get('/', async (c) => {
  const db = c.get('db');
  return c.json({ user: await describeUser(db, await currentUser(db, c)) });
});

/** Prend l'identité d'un prénom : son code s'il en a un, rien sinon. */
session.post('/', async (c) => {
  const db = c.get('db');
  const payload = await body(c);
  const id = Number(payload.user_id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Prénom invalide.');

  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user || !user.active) {
    throw badRequest('Utilisateur inconnu : sélectionnez votre prénom dans la liste.');
  }

  if (hasPin(user)) {
    await verifyPin(db, user, readPin(payload.pin));
  }

  c.header('Set-Cookie', sessionCookie(await issueSession(db, user.id)));
  return c.json({ user: await describeUser(db, user) });
});

session.delete('/', (c) => {
  c.header('Set-Cookie', clearedSessionCookie());
  return c.json({ user: null });
});

/**
 * Choisir ou changer son propre code.
 *
 * Changer un code déjà posé exige l'ancien : sans cela, un poste laissé ouvert
 * suffirait à s'approprier le prénom de quelqu'un pour de bon.
 */
session.put('/pin/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);

  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!user) throw notFound('Prénom introuvable.');

  const sessionId = await readSession(db, cookieValue(c, SESSION_COOKIE));

  if (hasPin(user)) {
    const blocked = lockRemaining(user);
    if (blocked > 0) {
      throw forbidden(`Trop d’essais. Ce prénom est bloqué encore ${blocked} minute(s).`);
    }
    await verifyPin(db, user, readPin(payload.current_pin));
  } else if (sessionId && sessionId !== user.id) {
    // Poser le premier code d'un prénom se fait depuis ce prénom-là, ou depuis
    // un poste où personne n'est identifié — pas au nom d'un collègue.
    const actor = await db.get('SELECT can_admin, first_name FROM users WHERE id = ?', sessionId);
    if (!actor?.can_admin) {
      throw forbidden(`Seul « ${user.first_name} » peut choisir son code.`);
    }
  }

  const record = await newPinRecord(readPin(payload.pin));
  await db.run(
    "UPDATE users SET pin_hash = ?, pin_salt = ?, failed_attempts = 0, locked_until = '' WHERE id = ?",
    record.pin_hash,
    record.pin_salt,
    id,
  );

  // Choisir son code identifie : inutile de le ressaisir dans la foulée.
  c.header('Set-Cookie', sessionCookie(await issueSession(db, id)));
  return c.json({ user: await describeUser(db, await db.get('SELECT * FROM users WHERE id = ?', id)) });
});
