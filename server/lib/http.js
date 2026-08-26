/** Erreur HTTP avec message destiné à l'utilisateur (en français). */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const notFound = (message) => new HttpError(404, message);
export const conflict = (message, details) => new HttpError(409, message, details);

/** Enveloppe un handler async pour router les rejets vers le middleware d'erreur. */
export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Identifie le technicien à l'origine d'une modification.
 * Aucune authentification : un simple prénom choisi dans une liste, transmis
 * dans le corps de la requête, la query string ou l'en-tête `X-User-Id`.
 */
export function requireUser(db, req) {
  const raw =
    (req.body && req.body.user_id) ?? req.query.user_id ?? req.get('x-user-id') ?? null;
  const userId = Number(raw);

  if (!raw || !Number.isInteger(userId)) {
    throw badRequest('Sélectionnez d’abord votre prénom avant de modifier le stock.');
  }

  const user = db.prepare('SELECT id, first_name, active FROM users WHERE id = ?').get(userId);
  if (!user) throw badRequest('Utilisateur inconnu : sélectionnez votre prénom dans la liste.');
  if (!user.active) throw badRequest(`Le prénom « ${user.first_name} » est désactivé.`);

  return user;
}

/** Identifiant numérique de route, ou 404. */
export function routeId(req, param = 'id') {
  const id = Number(req.params[param]);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Ressource introuvable.');
  return id;
}
