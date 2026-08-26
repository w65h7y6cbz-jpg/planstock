import { openDatabase } from '../db.js';
import { createApp } from '../app.js';

/**
 * Base en mémoire + application Express, pour des tests isolés et rapides.
 * Les deux locaux sont posés par la migration : `siteId` est le premier
 * (Optimium), `otherSiteId` le second (Sharp Center).
 */
export function createTestContext() {
  const db = openDatabase(':memory:');
  const app = createApp(db);
  const user = db
    .prepare('INSERT INTO users (first_name, active, created_at) VALUES (?, 1, ?)')
    .run('Daniel', new Date().toISOString());
  const sites = db.prepare('SELECT id FROM sites ORDER BY position, id').all();
  return {
    db,
    app,
    userId: Number(user.lastInsertRowid),
    siteId: sites[0].id,
    otherSiteId: sites[1].id,
  };
}

/** Identifiant du premier local, pour les tests qui n'ouvrent pas de contexte. */
export function firstSiteId(db) {
  return db.prepare('SELECT id FROM sites ORDER BY position, id').get().id;
}

/** Rayonnage de test avec ses étagères générées. */
export async function createRack(request, app, overrides = {}) {
  const response = await request(app)
    .post('/api/racks')
    .send({ site_id: 1, label: 'Rayon test', shelves_count: 3, ...overrides });
  return response.body;
}

/** Zone de test (pile au sol, palette…) : aucun étage. */
export async function createZone(request, app, overrides = {}) {
  const response = await request(app)
    .post('/api/racks')
    .send({ site_id: 1, kind: 'zone', label: 'Zone test', ...overrides });
  return response.body;
}

/** Retrouve l'identifiant d'une étagère depuis son numéro (1 = en haut). */
export function shelfIdOf(rack, shelfIndex) {
  const shelf = rack.shelves.find((candidate) => candidate.shelf_index === shelfIndex);
  if (!shelf) throw new Error(`Étagère E${shelfIndex} absente du rayonnage de test.`);
  return shelf.id;
}
