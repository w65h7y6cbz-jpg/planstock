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

/**
 * Identifie le technicien à l'origine d'une modification.
 * Aucune authentification : un simple prénom choisi dans une liste, transmis
 * dans le corps de la requête, la query string ou l'en-tête `X-User-Id`.
 */
export async function requireUser(db, c, payload = {}) {
  const raw = payload.user_id ?? c.req.query('user_id') ?? c.req.header('x-user-id') ?? null;
  const userId = Number(raw);

  if (!raw || !Number.isInteger(userId)) {
    throw badRequest('Sélectionnez d’abord votre prénom avant de modifier le stock.');
  }

  const user = await db.get('SELECT id, first_name, active FROM users WHERE id = ?', userId);
  if (!user) throw badRequest('Utilisateur inconnu : sélectionnez votre prénom dans la liste.');
  if (!user.active) throw badRequest(`Le prénom « ${user.first_name} » est désactivé.`);

  return user;
}

/** Identifiant numérique de route, ou 404. */
export function routeId(c, param = 'id') {
  const id = Number(c.req.param(param));
  if (!Number.isInteger(id) || id <= 0) throw notFound('Ressource introuvable.');
  return id;
}
