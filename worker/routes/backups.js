import { Hono } from 'hono';
import { badRequest, body, requireUser } from '../lib/http.js';

/**
 * Sauvegardes.
 *
 * Il n'y a plus de système de fichiers : la copie datée de la base à chaque
 * démarrage n'a plus de sens. Trois filets la remplacent :
 *
 * 1. D1 « Time Travel » — Cloudflare conserve trente jours d'historique et
 *    permet de revenir à n'importe quel instant. C'est le vrai filet, il
 *    fonctionne sans que personne y pense. Il se déclenche en ligne de
 *    commande : `npx wrangler d1 time-travel restore planstock --timestamp=…`
 * 2. Le téléchargement ci-dessous : un fichier JSON complet, à ranger où l'on
 *    veut. Utile avant une manipulation risquée.
 * 3. La restauration depuis un de ces fichiers, qui remplace tout le contenu.
 */

/** Tables dans l'ordre des dépendances (parents avant enfants). */
const TABLES = [
  'sites',
  'users',
  'racks',
  'shelves',
  'landmarks',
  // Les sous-stocks viennent après les locaux dont ils dépendent, et avant les
  // emplacements qui les désignent.
  'customers',
  'items',
  'item_locations',
  'movements',
  'settings',
];

const FORMAT = 'planstock-backup-1';

export const backups = new Hono();

/** Contenu complet de la base, dans un fichier à télécharger. */
backups.get('/export', async (c) => {
  const db = c.get('db');
  const tables = {};
  for (const table of TABLES) tables[table] = await db.all(`SELECT * FROM ${table}`);

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="planstock-${stamp}.json"`);
  return c.body(
    JSON.stringify({ format: FORMAT, exported_at: new Date().toISOString(), tables }, null, 2),
  );
});

/** Compteurs, pour montrer ce que pèse la base avant de la sauvegarder. */
backups.get('/', async (c) => {
  const db = c.get('db');
  const counts = {};
  for (const table of TABLES) {
    counts[table] = (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;
  }
  return c.json({ format: FORMAT, counts });
});

/**
 * Remplace tout le contenu par celui d'un fichier téléchargé plus tôt.
 * Les tables sont vidées dans l'ordre inverse des dépendances, puis
 * réinsérées dans l'ordre — le tout en un bloc atomique.
 */
backups.post('/restore', async (c) => {
  const db = c.get('db');
  const payload = await body(c);
  await requireUser(db, c, payload);

  const backup = payload.backup;
  if (!backup || backup.format !== FORMAT || typeof backup.tables !== 'object') {
    throw badRequest('Ce fichier n’est pas une sauvegarde PlanStock.');
  }

  const statements = [];
  for (const table of [...TABLES].reverse()) {
    statements.push(db.stmt(`DELETE FROM ${table}`));
  }

  for (const table of TABLES) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      const columns = Object.keys(row);
      if (columns.length === 0) continue;
      statements.push(
        db.stmt(
          `INSERT INTO ${table} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          ...columns.map((column) => row[column]),
        ),
      );
    }
  }

  await db.batch(statements);

  const counts = {};
  for (const table of TABLES) {
    counts[table] = (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;
  }
  return c.json({ restored: true, counts });
});
