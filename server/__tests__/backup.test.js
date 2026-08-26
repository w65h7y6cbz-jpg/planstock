import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupFileName, listBackups, purgeOldBackups, runStartupBackup } from '../backup.js';
import { openDatabase } from '../db.js';

let workDir;
let db;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planstock-test-'));
  db = openDatabase(path.join(workDir, 'planstock.db'));
});

afterEach(() => {
  db.close();
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('sauvegarde au démarrage', () => {
  it('nomme la copie planstock-AAAA-MM-JJ-HHmm.db', () => {
    expect(backupFileName(new Date(2026, 7, 26, 9, 5))).toBe('planstock-2026-08-26-0905.db');
  });

  it('crée une copie exploitable de la base', async () => {
    db.prepare('INSERT INTO users (first_name, active, created_at) VALUES (?, 1, ?)').run(
      'Daniel',
      new Date().toISOString(),
    );

    const backupsDir = path.join(workDir, 'backups');
    const { file } = await runStartupBackup(db, backupsDir);

    expect(fs.existsSync(file)).toBe(true);
    expect(path.basename(file)).toMatch(/^planstock-\d{4}-\d{2}-\d{2}-\d{4}\.db$/);

    const copie = openDatabase(file);
    expect(copie.prepare('SELECT first_name FROM users').get().first_name).toBe('Daniel');
    copie.close();
  });

  it('supprime les sauvegardes de plus de 30 jours et garde les récentes', async () => {
    const backupsDir = path.join(workDir, 'backups');
    await runStartupBackup(db, backupsDir);

    const ancienne = path.join(backupsDir, 'planstock-2020-01-01-0800.db');
    fs.copyFileSync(path.join(backupsDir, listBackups(backupsDir)[0].name), ancienne);
    const vieilleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    fs.utimesSync(ancienne, vieilleDate, vieilleDate);

    expect(listBackups(backupsDir)).toHaveLength(2);

    const removed = purgeOldBackups(backupsDir);
    expect(removed).toEqual(['planstock-2020-01-01-0800.db']);
    expect(listBackups(backupsDir)).toHaveLength(1);
  });

  it('ignore les fichiers qui ne sont pas des sauvegardes PlanStock', async () => {
    const backupsDir = path.join(workDir, 'backups');
    await runStartupBackup(db, backupsDir);
    fs.writeFileSync(path.join(backupsDir, 'notes.txt'), 'ne pas toucher');

    expect(listBackups(backupsDir).map((backup) => backup.name)).not.toContain('notes.txt');
    expect(fs.existsSync(path.join(backupsDir, 'notes.txt'))).toBe(true);
  });
});

describe('migrations', () => {
  it('sont rejouables sans erreur au redémarrage', () => {
    const file = path.join(workDir, 'planstock.db');
    db.close();

    const premier = openDatabase(file);
    const tables = premier
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    const appliquees = premier.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    premier.close();

    // Rouvrir la base ne doit rejouer aucune migration déjà appliquée.
    const second = openDatabase(file);
    expect(second.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n).toBe(appliquees);
    expect(appliquees).toBeGreaterThanOrEqual(2);
    db = second;

    expect(tables).toEqual(
      expect.arrayContaining([
        'items',
        'item_locations',
        'movements',
        'racks',
        'settings',
        'slots',
        'users',
      ]),
    );
  });
});
