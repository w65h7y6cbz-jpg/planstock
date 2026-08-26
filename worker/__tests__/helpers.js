import { env } from 'cloudflare:test';
import { app } from '../app.js';

/**
 * Appel de l'API dans le moteur des Workers, avec la base D1 de test.
 * Renvoie la même forme que l'ancien supertest : `{ status, body }`.
 */
/**
 * Prénom courant des tests. Modifier la structure demande maintenant d'être
 * identifié : `createContext` pose Daniel ici, et chaque appel le présente,
 * comme le fait le navigateur avec son cookie de session.
 */
let currentUserId = null;

export const actAs = (userId) => {
  currentUserId = userId;
};

export async function api(path, { method = 'GET', json, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (currentUserId !== null && init.headers['x-user-id'] === undefined) {
    init.headers['x-user-id'] = String(currentUserId);
  }
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }

  const response = await app.fetch(new Request(`http://planstock.test${path}`, init), env);
  const text = await response.text();

  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, text, headers: response.headers };
}

/** Les deux locaux sont posés par le schéma ; l'équipe, non. */
export async function createContext() {
  // Base neuve : personne n'est encore là pour autoriser la création du premier
  // prénom, et le serveur le sait.
  actAs(null);
  const daniel = await api('/api/users', { method: 'POST', json: { first_name: 'Daniel' } });
  actAs(daniel.body.id);
  const { body: sites } = await api('/api/sites');
  return {
    userId: daniel.body.id,
    siteId: sites[0].id,
    otherSiteId: sites[1].id,
  };
}

/** Appel volontairement anonyme, pour vérifier ce que le serveur refuse. */
export async function anonymousApi(path, options = {}) {
  const previous = currentUserId;
  actAs(null);
  try {
    return await api(path, options);
  } finally {
    actAs(previous);
  }
}

/** Rayonnage de test avec ses étagères générées. */
export async function createRack(overrides = {}) {
  const { body } = await api('/api/racks', {
    method: 'POST',
    json: { site_id: 1, label: 'Rayon test', shelves_count: 3, ...overrides },
  });
  return body;
}

/** Zone de test (pile au sol, palette…) : aucun étage. */
export async function createZone(overrides = {}) {
  const { body } = await api('/api/racks', {
    method: 'POST',
    json: { site_id: 1, kind: 'zone', label: 'Zone test', ...overrides },
  });
  return body;
}

/** Retrouve l'identifiant d'une étagère depuis son numéro (1 = en haut). */
export function shelfIdOf(rack, shelfIndex) {
  const shelf = rack.shelves.find((candidate) => candidate.shelf_index === shelfIndex);
  if (!shelf) throw new Error(`Étagère E${shelfIndex} absente du rayonnage de test.`);
  return shelf.id;
}
