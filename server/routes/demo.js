import { Router } from 'express';
import { demoDataAvailable, seedDemoData } from '../lib/demo.js';
import { conflict, requireUser } from '../lib/http.js';

/** Jeu de démonstration, installable uniquement sur une base sans stock. */
export function createDemoRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ available: demoDataAvailable(db) });
  });

  router.post('/', (req, res) => {
    const user = requireUser(db, req);
    if (!demoDataAvailable(db)) {
      throw conflict(
        'Le jeu de démonstration ne s’installe que sur une base sans rayonnage ni article, pour ne rien écraser.',
      );
    }
    res.status(201).json(seedDemoData(db, user));
  });

  return router;
}
