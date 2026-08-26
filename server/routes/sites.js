import { Router } from 'express';
import { badRequest, conflict, notFound, routeId } from '../lib/http.js';
import { listSites } from '../lib/store.js';

/**
 * Les locaux couverts par l'application (Optimium, Sharp Center).
 * On n'en crée ni n'en supprime depuis l'interface : ils sont posés par la
 * migration. Seuls le nom, la couleur, le logo et la taille du plan se règlent.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

function readAccent(value, fallback) {
  if (value === undefined) return fallback;
  const accent = String(value).trim().toLowerCase();
  if (!HEX.test(accent)) {
    throw badRequest('La couleur doit être un code hexadécimal, par exemple #e30613.');
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

export function createSitesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(listSites(db));
  });

  router.get('/:id', (req, res) => {
    const site = listSites(db).find((row) => row.id === routeId(req));
    if (!site) throw notFound('Local introuvable.');
    res.json(site);
  });

  router.patch('/:id', (req, res) => {
    const id = routeId(req);
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    if (!site) throw notFound('Local introuvable.');

    const body = req.body ?? {};
    const name = body.name === undefined ? site.name : String(body.name).trim();
    if (!name) throw badRequest('Le nom du local est obligatoire.');

    const clash = db.prepare('SELECT id FROM sites WHERE name = ? AND id <> ?').get(name, id);
    if (clash) throw conflict(`Un local s’appelle déjà « ${name} ».`);

    const next = {
      name,
      accent: readAccent(body.accent, site.accent),
      logo: readLogo(body.logo, site.logo),
      plan_width: readDimension(body.plan_width, site.plan_width, 'La largeur du plan'),
      plan_height: readDimension(body.plan_height, site.plan_height, 'La hauteur du plan'),
    };

    // Rétrécir le plan sous un emplacement déjà posé le ferait sortir du local.
    const overflow = db
      .prepare(
        `SELECT code, kind FROM racks
          WHERE site_id = ? AND (x + width > ? OR y + height > ?)`,
      )
      .all(id, next.plan_width, next.plan_height);
    if (overflow.length > 0) {
      throw conflict(
        `Le plan est trop petit : ${overflow.length} emplacement(s) en sortiraient. Déplacez-les d’abord.`,
      );
    }

    db.prepare(
      'UPDATE sites SET name = ?, accent = ?, logo = ?, plan_width = ?, plan_height = ? WHERE id = ?',
    ).run(next.name, next.accent, next.logo, next.plan_width, next.plan_height, id);

    res.json(listSites(db).find((row) => row.id === id));
  });

  return router;
}
