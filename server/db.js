import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Ouvre (et crée si besoin) la base SQLite, puis applique les migrations
 * qui n'ont pas encore été jouées. `:memory:` est accepté pour les tests.
 */
export function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  // WAL : lectures et écritures concurrentes sans blocage (plusieurs onglets ouverts).
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

/** Applique les fichiers `server/migrations/*.sql` par ordre alphabétique. */
export function applyMigrations(db, migrationsDir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
  const pending = files.filter((file) => !applied.has(file));
  if (pending.length === 0) return [];

  // Les migrations reconstruisent parfois une table (SQLite refuse DROP COLUMN
  // sur une colonne citée par un CHECK). Clés étrangères désactivées et renommage
  // « legacy » — qui ne réécrit pas les références des autres tables — le temps
  // de la migration ; l'intégrité est revérifiée juste après.
  const foreignKeysWereOn = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');

  try {
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.transaction(() => {
        db.exec(sql);
        record.run(file, new Date().toISOString());
      })();
    }
  } finally {
    db.pragma('legacy_alter_table = OFF');
    if (foreignKeysWereOn) db.pragma('foreign_keys = ON');
  }

  const violations = db.pragma('foreign_key_check');
  if (violations.length > 0) {
    throw new Error(
      `Migration incohérente : ${violations.length} référence(s) orpheline(s) (${violations
        .map((row) => row.table)
        .join(', ')}).`,
    );
  }

  return pending;
}
