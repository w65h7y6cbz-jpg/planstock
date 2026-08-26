import { Router } from 'express';
import { badRequest } from '../lib/http.js';

/** Réglages simples (thème, nom du local, ouverture automatique du rayon…). */
export function createSettingsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  });

  router.put('/', (req, res) => {
    const body = req.body ?? {};
    const entries = Object.entries(body);
    if (entries.length === 0) throw badRequest('Aucun réglage à enregistrer.');

    const upsert = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );

    db.transaction(() => {
      for (const [key, value] of entries) {
        if (!key || typeof key !== 'string') throw badRequest('Clé de réglage invalide.');
        upsert.run(key, String(value));
      }
    })();

    const rows = db.prepare('SELECT key, value FROM settings').all();
    res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  });

  return router;
}
