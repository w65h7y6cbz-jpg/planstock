import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { HttpError } from './lib/http.js';
import { createUsersRouter } from './routes/users.js';
import { createRacksRouter } from './routes/racks.js';
import { createItemsRouter } from './routes/items.js';
import { createMovementsRouter } from './routes/movements.js';
import { createSettingsRouter } from './routes/settings.js';
import { createExportRouter } from './routes/export.js';
import { createBackupsRouter } from './routes/backups.js';

/**
 * Construit l'application Express autour d'une base déjà ouverte.
 * La base est injectée pour que les tests puissent utiliser `:memory:`.
 */
export function createApp(db, options = {}) {
  const { webDistDir = null, backupsDir = null } = options;
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    const counts = {
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      racks: db.prepare('SELECT COUNT(*) AS n FROM racks').get().n,
      items: db.prepare('SELECT COUNT(*) AS n FROM items').get().n,
    };
    // `empty` déclenche le mode Inventaire initial côté front.
    res.json({ ok: true, counts, empty: counts.racks === 0 && counts.items === 0 });
  });

  app.use('/api/users', createUsersRouter(db));
  app.use('/api/racks', createRacksRouter(db));
  app.use('/api/items', createItemsRouter(db));
  app.use('/api/movements', createMovementsRouter(db));
  app.use('/api/settings', createSettingsRouter(db));
  app.use('/api/export', createExportRouter(db));
  app.use('/api/backups', createBackupsRouter(backupsDir));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Point d’entrée d’API inconnu.' });
  });

  if (webDistDir && fs.existsSync(webDistDir)) {
    app.use(express.static(webDistDir));
    // Repli SPA : toute autre URL renvoie index.html (routes gérées côté React).
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res
        .status(200)
        .type('html')
        .send(
          '<h1>PlanStock</h1><p>Interface non compilée. Lancez <code>npm run build</code>.</p>',
        );
    });
  }

  // Middleware d'erreur : messages en français, jamais de trace côté client.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, details: error.details ?? null });
      return;
    }
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Cette valeur existe déjà.' });
      return;
    }
    console.error('[PlanStock] Erreur inattendue :', error);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return app;
}
