import { Hono } from 'hono';
import { badRequest, body } from '../lib/http.js';

/** Réglages globaux, en clé/valeur. */
export const settings = new Hono();

async function readAll(db) {
  const rows = await db.all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

settings.get('/', async (c) => c.json(await readAll(c.get('db'))));

settings.put('/', async (c) => {
  const db = c.get('db');
  const entries = Object.entries(await body(c));
  if (entries.length === 0) throw badRequest('Aucun réglage à enregistrer.');

  const statements = entries.map(([key, value]) => {
    if (!key || typeof key !== 'string') throw badRequest('Clé de réglage invalide.');
    return db.stmt(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      String(value),
    );
  });

  await db.batch(statements);
  return c.json(await readAll(db));
});
