import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations } from './db.js';

const RETENTION_DAYS = 30;
// Le suffixe `-2`, `-3`… distingue deux sauvegardes de la même minute.
const BACKUP_PATTERN = /^planstock-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/;

/**
 * Tables dans l'ordre des dépendances (parents avant enfants).
 * `schema_migrations` est volontairement absente : la base vivante et la
 * sauvegarde sont amenées au même niveau de schéma avant la copie.
 */
const TABLES_IN_DEPENDENCY_ORDER = [
  'users',
  'racks',
  'slots',
  'items',
  'item_locations',
  'movements',
  'settings',
];

/** `planstock-2026-08-26-0930.db` (heure locale du PC). */
export function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `planstock-${stamp}.db`;
}

/**
 * Chemin libre pour une nouvelle sauvegarde.
 * Deux sauvegardes de la même minute (redémarrage rapproché, copie de sécurité
 * avant restauration) ne doivent jamais s'écraser l'une l'autre.
 */
export function uniqueBackupPath(backupsDir, date = new Date()) {
  const base = backupFileName(date).replace(/\.db$/, '');
  let candidate = path.join(backupsDir, `${base}.db`);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(backupsDir, `${base}-${suffix}.db`);
    suffix += 1;
  }
  return candidate;
}

/**
 * Copie datée de la base au démarrage, puis purge des copies de plus de 30 jours.
 * Utilise `db.backup()` de better-sqlite3 plutôt qu'une copie de fichier :
 * c'est la seule façon sûre de sauvegarder une base en mode WAL.
 */
export async function runStartupBackup(db, backupsDir, options = {}) {
  const { retentionDays = RETENTION_DAYS, now = new Date() } = options;
  fs.mkdirSync(backupsDir, { recursive: true });

  const destination = uniqueBackupPath(backupsDir, now);
  await db.backup(destination);

  const removed = purgeOldBackups(backupsDir, { retentionDays, now });
  return { file: destination, removed };
}

/** Supprime les sauvegardes plus anciennes que `retentionDays`. */
export function purgeOldBackups(backupsDir, options = {}) {
  const { retentionDays = RETENTION_DAYS, now = new Date() } = options;
  const limit = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const removed = [];

  for (const name of listBackupFiles(backupsDir)) {
    const full = path.join(backupsDir, name);
    if (fs.statSync(full).mtimeMs < limit) {
      fs.unlinkSync(full);
      removed.push(name);
    }
  }
  return removed;
}

/** Noms des sauvegardes présentes, de la plus récente à la plus ancienne. */
export function listBackupFiles(backupsDir) {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((name) => BACKUP_PATTERN.test(name))
    .sort()
    .reverse();
}

/** Sauvegardes avec taille et date, pour l'écran Paramètres. */
export function listBackups(backupsDir) {
  return listBackupFiles(backupsDir).map((name) => {
    const stat = fs.statSync(path.join(backupsDir, name));
    return { name, size: stat.size, created_at: new Date(stat.mtimeMs).toISOString() };
  });
}

export function isBackupName(name) {
  return typeof name === 'string' && BACKUP_PATTERN.test(name);
}

/** Colonnes communes à la base vivante et à la sauvegarde attachée. */
function sharedColumns(db, table) {
  const live = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  const source = db
    .prepare(`PRAGMA restore_src.table_info(${table})`)
    .all()
    .map((row) => row.name);
  return live.filter((name) => source.includes(name));
}

/**
 * Restaure une sauvegarde dans la base vivante.
 *
 * La copie se fait table par table sur la même connexion (ATTACH), plutôt qu'en
 * remplaçant le fichier : le serveur garde son handle ouvert, aucun redémarrage
 * n'est nécessaire. La sauvegarde est d'abord amenée au niveau de schéma courant,
 * pour qu'une copie ancienne reste restaurable.
 */
export async function restoreBackup(db, backupsDir, name) {
  if (!isBackupName(name)) throw new Error('Nom de sauvegarde invalide.');

  const source = path.join(backupsDir, name);
  if (!fs.existsSync(source)) throw new Error(`Sauvegarde « ${name} » introuvable.`);

  // Filet de sécurité : l'état actuel est sauvegardé avant d'être écrasé.
  const safety = await runStartupBackup(db, backupsDir);

  const backupDb = new Database(source);
  applyMigrations(backupDb);
  backupDb.close();

  db.pragma('foreign_keys = OFF');
  db.prepare('ATTACH DATABASE ? AS restore_src').run(source);

  try {
    db.transaction(() => {
      for (const table of [...TABLES_IN_DEPENDENCY_ORDER].reverse()) {
        db.prepare(`DELETE FROM main.${table}`).run();
      }
      for (const table of TABLES_IN_DEPENDENCY_ORDER) {
        const columns = sharedColumns(db, table);
        if (columns.length === 0) continue;
        const list = columns.map((column) => `"${column}"`).join(', ');
        db.prepare(
          `INSERT INTO main.${table} (${list}) SELECT ${list} FROM restore_src.${table}`,
        ).run();
      }
    })();
  } finally {
    db.prepare('DETACH DATABASE restore_src').run();
    db.pragma('foreign_keys = ON');
  }

  return { restored: name, safetyBackup: path.basename(safety.file) };
}
