import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { applyMigrations } from '../db.js';
import { createApp } from '../app.js';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

let workDir;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planstock-migration-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** Copie des migrations jusqu'à `lastVersion` incluse, pour simuler une base ancienne. */
function partialMigrationsDir(lastVersion) {
  const target = path.join(workDir, `migrations-${lastVersion}`);
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (file > lastVersion) break;
    fs.copyFileSync(path.join(MIGRATIONS_DIR, file), path.join(target, file));
  }
  return target;
}

describe('migration 003 : cases → étagères, ajout des zones', () => {
  it('reprend les données d’une base créée avant la refonte', () => {
    const file = path.join(workDir, 'planstock.db');

    // --- Base à l'ancien schéma (rayonnages avec cases), avec du contenu réel
    const ancienne = new Database(file);
    ancienne.pragma('foreign_keys = ON');
    applyMigrations(ancienne, partialMigrationsDir('002_item_families.sql'));

    const now = new Date().toISOString();
    ancienne
      .prepare('INSERT INTO users (id, first_name, active, created_at) VALUES (1, ?, 1, ?)')
      .run('Daniel', now);
    ancienne
      .prepare(
        `INSERT INTO racks (id, code, label, shelves_count, slots_per_shelf, x, y, width, height, rotation, created_at)
         VALUES (1, 3, 'Rayon imprimantes', 3, 4, 10, 12, 30, 18, 0, ?)`,
      )
      .run(now);
    for (let shelf = 1; shelf <= 3; shelf += 1) {
      for (let slot = 1; slot <= 4; slot += 1) {
        ancienne
          .prepare('INSERT INTO slots (rack_id, shelf_index, slot_index) VALUES (1, ?, ?)')
          .run(shelf, slot);
      }
    }
    ancienne
      .prepare(
        `INSERT INTO items (id, reference, reference_display, designation, kind, family_code, family_label, created_at, updated_at)
         VALUES (1, 'ARB123', 'ARB123', 'Imprimante A3', 'physical', '0310', 'IMPRIMANTE LASER N/B TGC22', ?, ?)`,
      )
      .run(now, now);
    const slotId = ancienne
      .prepare('SELECT id FROM slots WHERE rack_id = 1 AND shelf_index = 2 AND slot_index = 4')
      .get().id;
    ancienne
      .prepare('INSERT INTO item_locations (item_id, slot_id) VALUES (1, ?)')
      .run(slotId);
    ancienne
      .prepare(
        `INSERT INTO movements (item_id, item_reference, item_designation, user_id, user_first_name,
                                action, from_slot_id, from_slot_code, to_slot_id, to_slot_code, created_at)
         VALUES (1, 'ARB123', 'Imprimante A3', 1, 'Daniel', 'move', NULL, 'R03-E1-C1', ?, 'R03-E2-C4', ?)`,
      )
      .run(slotId, now);
    ancienne.close();

    // --- Mise à jour vers le schéma courant
    const db = new Database(file);
    db.pragma('foreign_keys = ON');
    const applied = applyMigrations(db);
    expect(applied).toContain('003_shelves_and_zones.sql');

    // Les 4 cases d'une étagère deviennent une seule étagère.
    expect(db.prepare('SELECT COUNT(*) AS n FROM shelves').get().n).toBe(3);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'slots'").get()).toBeUndefined();

    const app = createApp(db);
    return request(app)
      .get('/api/items/search?q=arb123')
      .then(({ body }) => {
        expect(body.exact.locations[0].code).toBe('R03-E2');
        expect(body.exact.family_code).toBe('0310');
        return request(app).get('/api/movements?reference=ARB123');
      })
      .then(({ body }) => {
        // Les codes de l'historique perdent la case et restent lisibles.
        expect(body[0]).toMatchObject({ from_code: 'R03-E1', to_code: 'R03-E2' });
        return request(app).get('/api/racks');
      })
      .then(({ body }) => {
        expect(body[0]).toMatchObject({ rack_code: 'R03', kind: 'rack', shelves_count: 3 });
        expect(body[0].aisle).toBe('');
        db.close();
      });
  });

  it('laisse une base neuve directement au schéma courant', () => {
    const db = new Database(path.join(workDir, 'neuve.db'));
    db.pragma('foreign_keys = ON');
    applyMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);

    expect(tables).toContain('shelves');
    expect(tables).not.toContain('slots');
    expect(db.pragma('foreign_key_check')).toHaveLength(0);
    db.close();
  });
});
