import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { listBackups, restoreBackup, runStartupBackup } from '../backup.js';
import { createApp } from '../app.js';
import { openDatabase } from '../db.js';

let workDir;
let backupsDir;
let db;
let app;
let userId;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planstock-restore-'));
  backupsDir = path.join(workDir, 'backups');
  db = openDatabase(path.join(workDir, 'planstock.db'));
  app = createApp(db, { backupsDir });
  userId = Number(
    db
      .prepare('INSERT INTO users (first_name, active, created_at) VALUES (?, 1, ?)')
      .run('Daniel', new Date().toISOString()).lastInsertRowid,
  );
});

afterEach(() => {
  db.close();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const seedRack = () =>
  request(app).post('/api/racks').send({ label: 'Rayon test', shelves_count: 2 });

describe('restauration d’une sauvegarde', () => {
  it('remet la base dans l’état de la copie', async () => {
    const rack = await seedRack();
    await request(app)
      .post('/api/items')
      .send({ user_id: userId, reference: 'ARB123', shelf_id: rack.body.shelves[0].id });

    const { file } = await runStartupBackup(db, backupsDir);
    const backupName = path.basename(file);

    // Modifications postérieures à la sauvegarde
    await request(app)
      .post('/api/items')
      .send({ user_id: userId, reference: 'APRES1', shelf_id: rack.body.shelves[1].id });
    expect((await request(app).get('/api/items')).body).toHaveLength(2);

    const response = await request(app)
      .post(`/api/backups/${backupName}/restore`)
      .send({ user_id: userId });

    expect(response.status).toBe(200);
    expect(response.body.restored).toBe(backupName);

    const items = (await request(app).get('/api/items')).body;
    expect(items.map((item) => item.reference)).toEqual(['ARB123']);
    // Le serveur continue de répondre sur la même connexion, sans redémarrage.
    expect((await request(app).get('/api/racks')).body).toHaveLength(1);
  });

  it('crée une sauvegarde de sécurité avant d’écraser', async () => {
    const rack = await seedRack();
    const { file } = await runStartupBackup(db, backupsDir);

    await request(app)
      .post('/api/items')
      .send({ user_id: userId, reference: 'PERDU1', shelf_id: rack.body.shelves[0].id });

    const response = await request(app)
      .post(`/api/backups/${path.basename(file)}/restore`)
      .send({ user_id: userId });

    const safety = response.body.safetyBackup;
    expect(safety).toMatch(/^planstock-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/);
    // La copie de sécurité ne doit jamais écraser la sauvegarde restaurée.
    expect(safety).not.toBe(path.basename(file));

    // L'article perdu est bien présent dans la copie de sécurité.
    const secours = openDatabase(path.join(backupsDir, safety));
    expect(secours.prepare('SELECT reference FROM items').all().map((row) => row.reference)).toContain(
      'PERDU1',
    );
    secours.close();
  });

  it('restaure une sauvegarde créée avant une migration plus récente', async () => {
    // Sauvegarde d'une base volontairement ramenée au schéma initial.
    const ancienne = path.join(backupsDir, 'planstock-2026-01-02-0800.db');
    fs.mkdirSync(backupsDir, { recursive: true });
    await db.backup(ancienne);

    const vieilleBase = openDatabase(ancienne);
    vieilleBase.exec('DROP INDEX idx_items_family');
    vieilleBase.exec('ALTER TABLE items DROP COLUMN family_code');
    vieilleBase.exec('ALTER TABLE items DROP COLUMN family_label');
    vieilleBase.prepare("DELETE FROM schema_migrations WHERE version = '002_item_families.sql'").run();
    vieilleBase
      .prepare(
        `INSERT INTO items (reference, reference_display, designation, kind, created_at, updated_at)
         VALUES ('ANCIEN1', 'ANCIEN1', 'Article ancien', 'service', ?, ?)`,
      )
      .run(new Date().toISOString(), new Date().toISOString());
    vieilleBase.close();

    const result = await restoreBackup(db, backupsDir, 'planstock-2026-01-02-0800.db');
    expect(result.restored).toBe('planstock-2026-01-02-0800.db');

    const items = (await request(app).get('/api/items')).body;
    expect(items.map((item) => item.reference)).toEqual(['ANCIEN1']);
    expect(items[0].family_code).toBeNull();
  });

  it('refuse un nom de sauvegarde invalide ou absent', async () => {
    const invalide = await request(app)
      .post('/api/backups/..%2Fplanstock.db/restore')
      .send({ user_id: userId });
    expect(invalide.status).toBe(400);

    const absente = await request(app)
      .post('/api/backups/planstock-2020-01-01-0000.db/restore')
      .send({ user_id: userId });
    expect(absente.status).toBe(409);
    expect(absente.body.error).toContain('introuvable');
  });

  it('refuse la restauration sans prénom sélectionné', async () => {
    const { file } = await runStartupBackup(db, backupsDir);
    const response = await request(app).post(`/api/backups/${path.basename(file)}/restore`).send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('prénom');
  });

  it('crée une sauvegarde à la demande', async () => {
    const response = await request(app).post('/api/backups').send({ user_id: userId });
    expect(response.status).toBe(201);
    expect(listBackups(backupsDir).map((backup) => backup.name)).toContain(response.body.created);
  });
});

describe('jeu de démonstration', () => {
  it('installe un plan et des articles sur une base vide', async () => {
    expect((await request(app).get('/api/demo')).body.available).toBe(true);

    const response = await request(app).post('/api/demo').send({ user_id: userId });
    expect(response.status).toBe(201);
    expect(response.body.racks).toBe(4);
    expect(response.body.items).toBeGreaterThan(15);

    const search = await request(app).get('/api/items/search?q=uk707el');
    expect(search.body.exact.reference_display).toBe('UK707E/L');
    expect(search.body.exact.locations[0].code).toBe('R03-E1');
    expect(search.body.exact.family_label).toContain('TGC22');

    const { body: movements } = await request(app).get('/api/movements');
    expect(movements).toHaveLength(response.body.items);
    expect(movements[0].user_first_name).toBe('Daniel');
  });

  it('refuse de s’installer si la base contient déjà du stock', async () => {
    await seedRack();
    expect((await request(app).get('/api/demo')).body.available).toBe(false);

    const response = await request(app).post('/api/demo').send({ user_id: userId });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('sans rayonnage');
  });
});
