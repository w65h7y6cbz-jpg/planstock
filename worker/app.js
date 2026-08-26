import { Hono } from 'hono';
import { Db } from './lib/db.js';
import { accessGuard } from './lib/access.js';
import { HttpError } from './lib/http.js';
import { access } from './routes/access.js';
import { backups } from './routes/backups.js';
import { customers } from './routes/customers.js';
import { demo } from './routes/demo.js';
import { exports_ } from './routes/export.js';
import { items } from './routes/items.js';
import { landmarks } from './routes/landmarks.js';
import { movements } from './routes/movements.js';
import { racks } from './routes/racks.js';
import { settings } from './routes/settings.js';
import { sites } from './routes/sites.js';
import { users } from './routes/users.js';

/**
 * L'API PlanStock, montée sur `/api`.
 *
 * L'interface compilée est servie par le réseau Cloudflare sans passer par ici
 * (voir `run_worker_first` dans wrangler.toml) : ce Worker ne s'occupe que des
 * données.
 */
export function createApp() {
  const app = new Hono();

  // La base D1 arrive par le binding `DB` ; l'enveloppe la rend utilisable
  // depuis les routes sans répéter `prepare`/`bind`.
  app.use('/api/*', async (c, next) => {
    c.set('db', new Db(c.env.DB));
    await next();
  });

  app.use('/api/*', accessGuard);

  app.get('/api/health', async (c) => {
    const db = c.get('db');
    const counts = {
      users: (await db.get('SELECT COUNT(*) AS n FROM users')).n,
      sites: (await db.get('SELECT COUNT(*) AS n FROM sites')).n,
      racks: (await db.get('SELECT COUNT(*) AS n FROM racks')).n,
      items: (await db.get('SELECT COUNT(*) AS n FROM items')).n,
    };
    // `empty` déclenche le mode Inventaire initial côté interface.
    return c.json({ ok: true, counts, empty: counts.racks === 0 && counts.items === 0 });
  });

  app.route('/api/access', access);
  app.route('/api/users', users);
  app.route('/api/sites', sites);
  app.route('/api/landmarks', landmarks);
  app.route('/api/customers', customers);
  app.route('/api/racks', racks);
  app.route('/api/items', items);
  app.route('/api/movements', movements);
  app.route('/api/settings', settings);
  app.route('/api/export', exports_);
  app.route('/api/backups', backups);
  app.route('/api/demo', demo);

  app.all('/api/*', (c) => c.json({ error: 'Point d’entrée d’API inconnu.' }, 404));

  // Messages en français, jamais de trace technique côté client.
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.message, details: error.details ?? null }, error.status);
    }
    if (String(error?.message ?? '').includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Cette valeur existe déjà.' }, 409);
    }
    console.error('[PlanStock] Erreur inattendue :', error);
    return c.json({ error: 'Erreur interne du serveur.' }, 500);
  });

  return app;
}

export const app = createApp();
