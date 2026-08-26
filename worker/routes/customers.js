import { Hono } from 'hono';
import { badRequest, body, conflict, notFound, routeId } from '../lib/http.js';
import { findSite } from '../lib/store.js';

/**
 * Sous-stocks réservés à un client.
 *
 * Certains clients achètent à l'année : le magasin garde pour eux des
 * exemplaires des mêmes références que le stock global, rangés dans les mêmes
 * rayonnages. Un client n'est donc pas un lieu, c'est un propriétaire — ce qui
 * lui appartient peut être éparpillé partout dans le local, ou tenir sur une
 * seule étagère.
 *
 * PlanStock ne compte rien et ne facture rien : il dit seulement à qui est
 * réservé ce qui se trouve à tel endroit.
 */

/** Un client appartient à un local : ses réservations n'ont de sens que là. */
async function customerOf(db, id) {
  const customer = await db.get('SELECT * FROM customers WHERE id = ?', id);
  if (!customer) throw notFound('Sous-stock introuvable.');
  return customer;
}

function readName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw badRequest('Le nom du sous-stock est obligatoire.');
  if (name.length > 60) throw badRequest('Le nom du sous-stock est trop long (60 caractères).');
  return name;
}

async function reservedCount(db, customerId) {
  const row = await db.get(
    'SELECT COUNT(*) AS total FROM item_locations WHERE customer_id = ?',
    customerId,
  );
  return row?.total ?? 0;
}

export const customers = new Hono();

/**
 * Les sous-stocks d'un local, avec le nombre de références réservées à chacun.
 * Sans `site_id`, tous les locaux : c'est ce que lit la sauvegarde.
 */
customers.get('/', async (c) => {
  const db = c.get('db');
  const siteId = Number(c.req.query('site_id'));
  const scoped = Number.isInteger(siteId) && siteId > 0;

  const rows = await db.all(
    `SELECT customers.*,
            (SELECT COUNT(*) FROM item_locations
              WHERE item_locations.customer_id = customers.id) AS reserved_count
       FROM customers
      ${scoped ? 'WHERE customers.site_id = ?' : ''}
      ORDER BY customers.site_id, customers.name`,
    ...(scoped ? [siteId] : []),
  );
  return c.json(rows);
});

customers.post('/', async (c) => {
  const db = c.get('db');
  const payload = await body(c);
  const site = await findSite(db, Number(payload.site_id));
  const name = readName(payload.name);

  const clash = await db.get(
    'SELECT id FROM customers WHERE site_id = ? AND name = ?',
    site.id,
    name,
  );
  if (clash) throw conflict(`Un sous-stock s’appelle déjà « ${name} » dans ce local.`);

  const { lastInsertRowid } = await db.run(
    'INSERT INTO customers (site_id, name, created_at) VALUES (?, ?, ?)',
    site.id,
    name,
    new Date().toISOString(),
  );

  return c.json({ ...(await customerOf(db, lastInsertRowid)), reserved_count: 0 }, 201);
});

customers.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);
  const customer = await customerOf(db, id);

  const name = payload.name === undefined ? customer.name : readName(payload.name);

  const clash = await db.get(
    'SELECT id FROM customers WHERE site_id = ? AND name = ? AND id <> ?',
    customer.site_id,
    name,
    id,
  );
  if (clash) throw conflict(`Un sous-stock s’appelle déjà « ${name} » dans ce local.`);

  await db.run('UPDATE customers SET name = ? WHERE id = ?', name, id);
  return c.json({ ...(await customerOf(db, id)), reserved_count: await reservedCount(db, id) });
});

/**
 * La clé étrangère est en cascade : supprimer un client emporterait ses
 * réservations sans rien dire, et les articles concernés sembleraient avoir
 * quitté le magasin. On refuse tant qu'il en reste, comme pour un rayonnage
 * qui contient encore quelque chose.
 */
customers.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const customer = await customerOf(db, id);

  const reserved = await reservedCount(db, id);
  if (reserved > 0) {
    throw conflict(
      `« ${customer.name} » a encore ${reserved} référence(s) réservée(s). Reversez-les au stock global avant de supprimer le sous-stock.`,
    );
  }

  await db.run('DELETE FROM customers WHERE id = ?', id);
  return c.json({ deleted: true, id });
});
