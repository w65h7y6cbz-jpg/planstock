import { Hono } from 'hono';
import { badRequest, body, conflict, notFound, routeId } from '../lib/http.js';
import { listSites } from '../lib/store.js';

/**
 * Les locaux couverts par l'application (Optimium, Sharp Center).
 * On n'en crée ni n'en supprime depuis l'interface : ils sont posés par le
 * schéma. Seuls le nom, la couleur, le logo et la taille du plan se règlent.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

function readAccent(value, fallback) {
  if (value === undefined) return fallback;
  const accent = String(value).trim().toLowerCase();
  if (!HEX.test(accent)) {
    throw badRequest('La couleur doit être un code hexadécimal, par exemple #e42020.');
  }
  return accent;
}

/** Nom de fichier de logo : pas de chemin, pour ne jamais sortir de web/public/logos. */
function readLogo(value, fallback) {
  if (value === undefined) return fallback;
  const logo = String(value).trim();
  if (logo === '') return '';
  if (!/^[\w.-]+\.(png|jpg|jpeg|svg|webp)$/i.test(logo)) {
    throw badRequest('Le logo doit être un nom de fichier image (ex. optimium.png).');
  }
  return logo;
}

function readDimension(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 10 || number > 100) {
    throw badRequest(`${field} doit être un nombre entre 10 et 100.`);
  }
  return Math.round(number * 100) / 100;
}

export const sites = new Hono();

sites.get('/', async (c) => c.json(await listSites(c.get('db'))));

sites.get('/:id', async (c) => {
  const id = routeId(c);
  const site = (await listSites(c.get('db'))).find((row) => row.id === id);
  if (!site) throw notFound('Local introuvable.');
  return c.json(site);
});

sites.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);

  const site = await db.get('SELECT * FROM sites WHERE id = ?', id);
  if (!site) throw notFound('Local introuvable.');

  const name = payload.name === undefined ? site.name : String(payload.name).trim();
  if (!name) throw badRequest('Le nom du local est obligatoire.');

  const clash = await db.get('SELECT id FROM sites WHERE name = ? AND id <> ?', name, id);
  if (clash) throw conflict(`Un local s’appelle déjà « ${name} ».`);

  const next = {
    name,
    accent: readAccent(payload.accent, site.accent),
    logo: readLogo(payload.logo, site.logo),
    plan_width: readDimension(payload.plan_width, site.plan_width, 'La largeur du plan'),
    plan_height: readDimension(payload.plan_height, site.plan_height, 'La hauteur du plan'),
  };

  // Rétrécir le plan sous un emplacement déjà posé le ferait sortir du local.
  const overflow = await db.all(
    `SELECT code, kind FROM racks
      WHERE site_id = ? AND (x + width > ? OR y + height > ?)`,
    id,
    next.plan_width,
    next.plan_height,
  );
  if (overflow.length > 0) {
    throw conflict(
      `Le plan est trop petit : ${overflow.length} emplacement(s) en sortiraient. Déplacez-les d’abord.`,
    );
  }

  await db.run(
    'UPDATE sites SET name = ?, accent = ?, logo = ?, plan_width = ?, plan_height = ? WHERE id = ?',
    next.name,
    next.accent,
    next.logo,
    next.plan_width,
    next.plan_height,
    id,
  );

  return c.json((await listSites(db)).find((row) => row.id === id));
});
