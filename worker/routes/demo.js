import { Hono } from 'hono';
import { demoDataAvailable, seedDemoData } from '../lib/demo.js';
import { findDemoSite, seedDemoSite } from '../lib/demoSite.js';
import { body, conflict, notFound, requireUser } from '../lib/http.js';

/**
 * Deux jeux de démonstration, pour deux moments différents :
 *
 * - `/api/demo` remplit une base **vide**, au tout premier lancement, pour
 *   découvrir l'application avant d'avoir saisi le moindre inventaire.
 * - `/api/demo/site` remet à neuf le **local « Démo »**, et lui seul. C'est
 *   celui qui sert à présenter PlanStock à quelqu'un : une démonstration laisse
 *   des traces, et personne n'a envie de reconstruire un magasin à la main
 *   avant la réunion suivante.
 */
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

/** Le local de démonstration existe-t-il, et que contient-il aujourd'hui ? */
demo.get('/site', async (c) => {
  const site = await findDemoSite(c.get('db'));
  return c.json({ site: site ? { id: site.id, code: site.code, name: site.name } : null });
});

/**
 * Repose le local de démonstration à neuf.
 *
 * Destructif, mais **uniquement pour ce local** : les meubles, les articles et
 * les stocks à part qu'il contient. Optimium et Sharp Center n'ont aucune ligne
 * en commun avec lui et ne bougent pas.
 */
demo.post('/site', async (c) => {
  const db = c.get('db');
  const user = await requireUser(db, c, await body(c));

  if (!(await findDemoSite(db))) {
    throw notFound('Le local de démonstration est absent de cette base.');
  }
  return c.json(await seedDemoSite(db, user), 201);
});
