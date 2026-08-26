import { openDatabase } from '../db.js';
import { createApp } from '../app.js';

/** Base en mémoire + application Express, pour des tests isolés et rapides. */
export function createTestContext() {
  const db = openDatabase(':memory:');
  const app = createApp(db);
  const user = db
    .prepare('INSERT INTO users (first_name, active, created_at) VALUES (?, 1, ?)')
    .run('Daniel', new Date().toISOString());
  return { db, app, userId: Number(user.lastInsertRowid) };
}

/** Rayonnage de test + ses cases générées. */
export async function createRack(request, app, overrides = {}) {
  const response = await request(app)
    .post('/api/racks')
    .send({ label: 'Rayon test', shelves_count: 3, slots_per_shelf: 4, ...overrides });
  return response.body;
}

/** Retrouve l'identifiant d'une case depuis son étagère et sa colonne. */
export function slotIdOf(rack, shelfIndex, slotIndex) {
  const slot = rack.slots.find(
    (candidate) => candidate.shelf_index === shelfIndex && candidate.slot_index === slotIndex,
  );
  if (!slot) throw new Error(`Case E${shelfIndex}-C${slotIndex} absente du rayonnage de test.`);
  return slot.id;
}
