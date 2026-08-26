/** Erreur HTTP avec message destiné à l'utilisateur (en français). */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const forbidden = (message, details) => new HttpError(403, message, details);
export const notFound = (message) => new HttpError(404, message);
export const conflict = (message, details) => new HttpError(409, message, details);

/** Corps JSON de la requête, ou objet vide si le corps est absent ou illisible. */
export async function body(c) {
  try {
    return (await c.req.json()) ?? {};
  } catch {
    return {};
  }
}

/** Valeur d'un cookie de la requête, ou `null`. */
export function cookieValue(c, name) {
  const header = c.req.header('cookie') ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Identifie le technicien à l'origine d'une modification.
 *
 * Deux chemins, et c'est volontaire :
 *
 * - **Le prénom porte un code** : seule la session signée fait foi. Annoncer son
 *   identifiant ne suffit plus, sinon le code ne servirait à rien.
 * - **Le prénom n'a pas de code** : l'identifiant annoncé suffit, comme avant.
 *   C'est un trou, assumé le temps que les codes soient posés — sans lui,
 *   activer cette version mettrait toute l'équipe dehors du jour au lendemain.
 */
export async function identifyUser(db, c, payload = {}) {
  const { SESSION_COOKIE, readSession } = await import('./identity.js');

  const sessionId = await readSession(db, cookieValue(c, SESSION_COOKIE));
  const claimed = payload.user_id ?? c.req.query('user_id') ?? c.req.header('x-user-id') ?? null;
  const userId = sessionId ?? Number(claimed);
  if (!userId || !Number.isInteger(userId)) return { user: null, sessionId, reason: 'absent' };

  const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
  if (!user) return { user: null, sessionId, reason: 'inconnu' };
  if (!user.active) return { user: null, sessionId, reason: 'désactivé', name: user.first_name };
  if (user.pin_hash && sessionId !== user.id) {
    return { user: null, sessionId, reason: 'code', name: user.first_name };
  }

  return { user, sessionId, reason: null };
}

export async function requireUser(db, c, payload = {}) {
  const { user, reason, name } = await identifyUser(db, c, payload);
  if (user) return user;

  if (reason === 'code') throw forbidden(`Saisissez le code de « ${name} » pour continuer.`);
  if (reason === 'désactivé') throw badRequest(`Le prénom « ${name} » est désactivé.`);
  if (reason === 'inconnu') {
    throw badRequest('Utilisateur inconnu : sélectionnez votre prénom dans la liste.');
  }
  throw badRequest('Sélectionnez d’abord votre prénom avant de modifier le stock.');
}

/** Libellés des droits, pour un refus qui dit quoi demander à qui. */
const PERMISSION_LABELS = {
  can_move: 'déplacer un article',
  can_delete: 'supprimer un article',
  can_admin: 'modifier le plan et les réglages',
};

/**
 * Exige un droit. Le refus nomme le geste plutôt que la colonne : « Marc n'a
 * pas le droit de déplacer un article » se comprend sans lire le code.
 */
export function requirePermission(user, permission) {
  if (user[permission]) return user;
  throw forbidden(
    `« ${user.first_name} » n’a pas le droit de ${PERMISSION_LABELS[permission]}. Demandez à quelqu’un qui l’a, ou faites-vous accorder ce droit dans Réglages → Équipe.`,
  );
}

/** Identifiant numérique de route, ou 404. */
export function routeId(c, param = 'id') {
  const id = Number(c.req.param(param));
  if (!Number.isInteger(id) || id <= 0) throw notFound('Ressource introuvable.');
  return id;
}
