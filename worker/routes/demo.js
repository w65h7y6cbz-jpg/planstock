import { Hono } from 'hono';
import { demoDataAvailable, seedDemoData } from '../lib/demo.js';
import { body, conflict, requireUser } from '../lib/http.js';

/** Jeu de démonstration, installable uniquement sur une base sans stock. */
export const demo = new Hono();

demo.get('/', async (c) => c.json({ available: await demoDataAvailable(c.get('db')) }));

demo.post('/', async (c) => {
  const db = c.get('db');
  const user = await requireUser(db, c, await body(c));

  if (!(await demoDataAvailable(db))) {
    throw conflict(
      'Le jeu de démonstration ne s’installe que sur une base sans rayonnage ni article, pour ne rien écraser.',
    );
  }
  return c.json(await seedDemoData(db, user), 201);
});
