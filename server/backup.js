import fs from 'node:fs';
import path from 'node:path';

const RETENTION_DAYS = 30;
const BACKUP_PATTERN = /^planstock-\d{4}-\d{2}-\d{2}-\d{4}\.db$/;

/** `planstock-2026-08-26-0930.db` (heure locale du PC). */
export function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `planstock-${stamp}.db`;
}

/**
 * Copie datée de la base au démarrage, puis purge des copies de plus de 30 jours.
 * Utilise `db.backup()` de better-sqlite3 plutôt qu'une copie de fichier :
 * c'est la seule façon sûre de sauvegarder une base en mode WAL.
 */
export async function runStartupBackup(db, backupsDir, options = {}) {
  const { retentionDays = RETENTION_DAYS, now = new Date() } = options;
  fs.mkdirSync(backupsDir, { recursive: true });

  const destination = path.join(backupsDir, backupFileName(now));
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
