import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { runStartupBackup } from './backup.js';
import { createApp } from './app.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const WEB_DIST_DIR = path.join(ROOT_DIR, 'web', 'dist');

const PORT = Number(process.env.PLANSTOCK_PORT) || 4823;
// Par défaut le serveur n'écoute que sur ce PC. Pour un accès depuis les autres
// postes du SAV plus tard : PLANSTOCK_HOST=0.0.0.0 (aucun autre changement).
const HOST = process.env.PLANSTOCK_HOST || '127.0.0.1';

const db = openDatabase(path.join(DATA_DIR, 'planstock.db'));

try {
  const { file, removed } = await runStartupBackup(db, BACKUPS_DIR);
  console.log(`[PlanStock] Sauvegarde : ${path.relative(ROOT_DIR, file)}`);
  if (removed.length > 0) {
    console.log(`[PlanStock] ${removed.length} sauvegarde(s) de plus de 30 jours supprimée(s).`);
  }
} catch (error) {
  // Une sauvegarde impossible ne doit pas empêcher l'équipe de travailler.
  console.error('[PlanStock] Sauvegarde impossible :', error.message);
}

const app = createApp(db, { webDistDir: WEB_DIST_DIR, backupsDir: BACKUPS_DIR });

const server = app.listen(PORT, HOST, () => {
  console.log(`[PlanStock] Prêt sur http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
