import { Hono } from 'hono';
import { listItems } from '../lib/store.js';

/**
 * Export des articles en CSV.
 *
 * Le fichier Excel, lui, est fabriqué dans le navigateur : la bibliothèque qui
 * l'écrit pèse plusieurs centaines de kilo-octets et s'appuie sur des modules
 * Node absents du moteur des Workers. Le poste du technicien la charge à la
 * demande, au clic sur le bouton.
 */

export const HEADERS = [
  'Référence',
  'Désignation',
  'Famille',
  'Libellé famille',
  'Type',
  'Local',
  'Emplacement',
  'Réservé à',
  'Côté',
];

export const KIND_LABELS = {
  physical: 'Physique',
  service: 'Service',
  other_site: 'Hors PlanStock',
};

const SIDE_LABELS = { left: 'Gauche', center: 'Centre', right: 'Droite' };

/**
 * Une ligne par article ; les emplacements multiples sont joints par « + ».
 *
 * Un article peut être au stock global ET réservé chez un ou plusieurs clients.
 * Le code porte alors le nom du sous-stock (« R03-E2 · AOCCI »), sans quoi
 * « R03-E1 + R03-E2 » ne dirait pas lequel est réservé. La colonne « Réservé à »
 * reprend les noms seuls, pour filtrer le tableur par client.
 */
export async function exportRows(db, siteId = null) {
  const join = (values) => [...new Set(values.filter(Boolean))].join(' + ');
  const owned = (location) =>
    location.customer_name ? `${location.code} · ${location.customer_name}` : location.code;

  return (await listItems(db, { siteId })).map((item) => [
    item.reference_display,
    item.designation,
    item.family_code ?? '',
    item.family_label ?? '',
    KIND_LABELS[item.kind] ?? item.kind,
    join(item.locations.map((location) => location.site_name)),
    item.locations.map(owned).join(' + '),
    join(item.locations.map((location) => location.customer_name)),
    join(item.locations.map((location) => SIDE_LABELS[location.side])),
  ]);
}

function fileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Échappement CSV : guillemets doublés, champ cité si nécessaire. */
function csvCell(value) {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** `?site_id=` limite l'export au local demandé. */
function readSiteId(c) {
  const siteId = Number(c.req.query('site_id'));
  return Number.isInteger(siteId) && siteId > 0 ? siteId : null;
}

export const exports_ = new Hono();

exports_.get('/csv', async (c) => {
  const rows = await exportRows(c.get('db'), readSiteId(c));
  const lines = [HEADERS, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');

  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="planstock-${fileStamp()}.csv"`);
  // BOM UTF-8 : sans lui, Excel en français affiche mal les accents.
  return c.body(`﻿${lines}\r\n`);
});

/** Les mêmes lignes en JSON, pour que le navigateur en fasse un vrai .xlsx. */
exports_.get('/rows', async (c) =>
  c.json({ headers: HEADERS, rows: await exportRows(c.get('db'), readSiteId(c)) }),
);
