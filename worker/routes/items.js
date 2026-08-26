import { Hono } from 'hono';
import { badRequest, body, conflict, notFound, requireUser, routeId } from '../lib/http.js';
import { cleanDisplayReference, normalizeReference } from '../lib/reference.js';
import {
  SIDES,
  findItemById,
  findItemByReference,
  findShelf,
  findZone,
  listItems,
  movementStatement,
  movementStatementByReference,
} from '../lib/store.js';

// `other_site` est conservé tel quel en base ; côté interface il s'appelle
// « Hors PlanStock » depuis que les deux locaux sont gérés ici.
const KINDS = ['physical', 'service', 'other_site'];
const PREFIX_MIN_LENGTH = 3;
const PREFIX_MAX_RESULTS = 8;

function readKind(value, fallback = 'physical') {
  if (value === undefined || value === null || value === '') return fallback;
  const kind = String(value);
  if (!KINDS.includes(kind)) {
    throw badRequest('Type d’article invalide (attendu : Physique, Service ou Hors PlanStock).');
  }
  return kind;
}

/** Un article Service ou Hors PlanStock n'a jamais d'emplacement physique. */
function isPhysical(kind) {
  return kind === 'physical';
}

/** Famille Sage (facultative) : conservée telle quelle, jamais interprétée. */
function readFamily(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  return String(value).trim() || null;
}

function readId(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`${field} invalide.`);
  return id;
}

/** Côté d'étagère : indication facultative, jamais obligatoire. */
function readSide(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!SIDES.includes(String(value))) {
    throw badRequest('Côté invalide (attendu : gauche, centre ou droite).');
  }
  return String(value);
}

/**
 * Emplacement demandé : une étagère (`shelf_id`) ou une zone (`zone_id`),
 * jamais les deux. `undefined` si le corps n'en mentionne aucun.
 */
async function readLocation(db, payload) {
  const shelfId = readId(payload.shelf_id, 'Étagère');
  const zoneId = readId(payload.zone_id, 'Zone');

  if (shelfId && zoneId) {
    throw badRequest('Choisissez soit une étagère, soit une zone, pas les deux.');
  }
  if (shelfId) return findShelf(db, shelfId, readSide(payload.side));
  // Une zone n'a ni étagère ni côté : le champ est ignoré sans erreur.
  if (zoneId) return findZone(db, zoneId);
  return payload.shelf_id === undefined && payload.zone_id === undefined ? undefined : null;
}

function locationColumns(location) {
  return {
    shelf_id: location?.kind === 'shelf' ? location.shelf_id : null,
    zone_id: location?.kind === 'zone' ? location.zone_id : null,
    side: location?.kind === 'shelf' ? (location.side ?? null) : null,
  };
}

/** `?site_id=` restreint la liste au local demandé. */
function readSiteId(c) {
  const siteId = Number(c.req.query('site_id'));
  return Number.isInteger(siteId) && siteId > 0 ? siteId : null;
}

/**
 * `?customer_id=` bascule la recherche dans le sous-stock d'un client.
 * Absent : le stock global du local, c'est le cas ordinaire.
 */
async function readSearchCustomerId(db, c, siteId) {
  const raw = c.req.query('customer_id');
  if (raw === undefined || raw === '') return null;

  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Stock à part invalide.');

  const customer = await db.get('SELECT id, site_id, name FROM customers WHERE id = ?', id);
  if (!customer) throw notFound('Stock à part introuvable.');
  if (siteId && customer.site_id !== siteId) {
    throw badRequest(`« ${customer.name} » n’est pas un stock à part de ce local.`);
  }
  return customer.id;
}

/**
 * Client à qui ce rangement est réservé, ou `null` pour le stock global.
 * Le client doit appartenir au local de l'emplacement visé : sans ce contrôle
 * on réserverait à un client de Sharp Center une étagère d'Optimium.
 */
async function readLocationCustomer(db, payload, location) {
  const id = readId(payload.customer_id, 'Stock');
  if (id === null) return null;

  const customer = await db.get('SELECT id, site_id, name FROM customers WHERE id = ?', id);
  if (!customer) throw notFound('Stock à part introuvable.');
  // En modification, le stock peut être précisé sans que l'emplacement change :
  // on ne contrôle le local que lorsqu'une destination est connue.
  if (location && customer.site_id !== location.site_id) {
    throw badRequest(`« ${customer.name} » n’est pas un stock à part de ce local.`);
  }
  return customer;
}

export const items = new Hono();

items.get('/', async (c) => {
  const search = normalizeReference(c.req.query('q') ?? '');
  return c.json(
    await listItems(c.get('db'), { search: search || null, siteId: readSiteId(c) }),
  );
});

/**
 * Recherche depuis le bon de préparation. La référence prime : correspondance
 * exacte, puis suggestions par préfixe (à partir de 3 caractères, 8 maximum).
 * Les correspondances de désignation viennent après, séparément, et ne sont
 * jamais confondues avec une référence.
 */
items.get('/search', async (c) => {
  const db = c.get('db');
  const raw = String(c.req.query('q') ?? '');
  const normalized = normalizeReference(raw);
  const siteId = readSiteId(c);
  // `null` = stock global : c'est le défaut, et c'est ce qu'on veut.
  const customerId = await readSearchCustomerId(db, c, siteId);

  if (!normalized) {
    return c.json({ query: raw, normalized: '', exact: null, matches: [], by_designation: [] });
  }

  const exact = await findItemByReference(db, normalized, siteId, customerId);
  const longEnough = normalized.length >= PREFIX_MIN_LENGTH;
  const matches = longEnough
    ? await listItems(db, { search: normalized, siteId, customerId, limit: PREFIX_MAX_RESULTS })
    : exact
      ? [exact]
      : [];

  // Le texte tapé sert tel quel pour la désignation : « toner » ne se
  // normalise pas comme une référence.
  const known = new Set(matches.map((item) => item.id));
  const byDesignation = longEnough
    ? (
        await listItems(db, {
          designation: raw.trim(),
          siteId,
          customerId,
          limit: PREFIX_MAX_RESULTS,
        })
      ).filter((item) => !known.has(item.id))
    : [];

  return c.json({ query: raw, normalized, exact, matches, by_designation: byDesignation });
});

items.get('/:id', async (c) => c.json(await findItemById(c.get('db'), routeId(c))));

items.post('/', async (c) => {
  const db = c.get('db');
  const payload = await body(c);
  const user = await requireUser(db, c, payload);

  const display = cleanDisplayReference(payload.reference);
  const reference = normalizeReference(display);
  if (!reference) throw badRequest('La référence est obligatoire.');

  if (await findItemByReference(db, reference)) {
    throw conflict(`La référence « ${display} » existe déjà.`);
  }

  const kind = readKind(payload.kind);
  const requested = await readLocation(db, payload);
  const location = requested ?? null;
  const customer = await readLocationCustomer(db, payload, location);
  if (customer && !location) {
    throw badRequest('Un article sans emplacement ne peut pas être rangé dans un stock à part.');
  }

  if (isPhysical(kind) && !location) {
    throw badRequest('Un article physique doit être rangé sur une étagère ou une zone.');
  }
  if (!isPhysical(kind) && location) {
    throw badRequest('Un article Service ou Hors PlanStock n’a pas d’emplacement physique.');
  }

  const now = new Date().toISOString();
  const designation = String(payload.designation ?? '').trim();
  const columns = locationColumns(location);

  // Un seul bloc atomique : l'article, son emplacement et sa trace. L'article
  // tout juste inséré se retrouve par `last_insert_rowid()` pour l'emplacement,
  // et par sa référence — unique — pour le mouvement.
  await db.batch([
    db.stmt(
      `INSERT INTO items (reference, reference_display, designation, kind,
                          family_code, family_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      reference,
      display,
      designation,
      kind,
      readFamily(payload.family_code),
      readFamily(payload.family_label),
      now,
      now,
    ),
    location
      ? db.stmt(
          `INSERT INTO item_locations (item_id, shelf_id, zone_id, side, customer_id)
           VALUES (last_insert_rowid(), ?, ?, ?, ?)`,
          columns.shelf_id,
          columns.zone_id,
          columns.side,
          customer?.id ?? null,
        )
      : null,
    movementStatementByReference(db, {
      reference,
      designation,
      user,
      action: 'create',
      to: location ? { ...location, customer_name: customer?.name ?? '' } : null,
    }),
  ]);

  const created = await findItemByReference(db, reference);
  return c.json(created, 201);
});

items.patch('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);
  const user = await requireUser(db, c, payload);
  const item = await findItemById(db, id);

  const display =
    payload.reference === undefined
      ? item.reference_display
      : cleanDisplayReference(payload.reference);
  const reference = normalizeReference(display);
  if (!reference) throw badRequest('La référence est obligatoire.');

  if (reference !== item.reference) {
    const clash = await findItemByReference(db, reference);
    if (clash && clash.id !== id) throw conflict(`La référence « ${display} » existe déjà.`);
  }

  const kind = readKind(payload.kind, item.kind);
  const designation =
    payload.designation === undefined ? item.designation : String(payload.designation).trim();
  const familyCode = readFamily(payload.family_code, item.family_code);
  const familyLabel = readFamily(payload.family_label, item.family_label);

  const requested = await readLocation(db, payload);
  const customer = await readLocationCustomer(db, payload, requested ?? null);
  const customerId = customer?.id ?? null;

  // Un article peut être rangé au stock général ET dans un ou plusieurs stocks
  // à part. On ne touche qu'à celui qui est visé — sinon corriger la
  // désignation d'un article emporterait ses réservations au passage.
  const current = item.locations.find((row) => (row.customer_id ?? null) === customerId) ?? null;
  let target = current;

  if (!isPhysical(kind)) {
    target = null;
  } else if (requested !== undefined) {
    if (!requested) {
      throw badRequest('Un article physique doit être rangé sur une étagère ou une zone.');
    }
    target = requested;
  } else if (!current) {
    throw badRequest('Un article physique doit être rangé sur une étagère ou une zone.');
  }

  const locationChanged =
    (current?.code ?? null) !== (target?.code ?? null) ||
    (current?.side ?? null) !== (target?.side ?? null);
  const movedElsewhere = (current?.code ?? null) !== (target?.code ?? null);
  const fieldsChanged =
    reference !== item.reference ||
    designation !== item.designation ||
    kind !== item.kind ||
    familyCode !== item.family_code ||
    familyLabel !== item.family_label;

  const next = { ...item, reference, designation };
  const columns = locationColumns(target);

  await db.batch([
    db.stmt(
      `UPDATE items SET reference = ?, reference_display = ?, designation = ?, kind = ?,
                        family_code = ?, family_label = ?, updated_at = ?
        WHERE id = ?`,
      reference,
      display,
      designation,
      kind,
      familyCode,
      familyLabel,
      new Date().toISOString(),
      id,
    ),
    // Un article qui devient Service ou Hors PlanStock n'a plus d'existence
    // physique nulle part : il perd tous ses rangements, stocks à part compris.
    // Sinon on ne défait que celui du stock visé.
    !isPhysical(kind)
      ? db.stmt('DELETE FROM item_locations WHERE item_id = ?', id)
      : locationChanged
        ? db.stmt(
            'DELETE FROM item_locations WHERE item_id = ? AND customer_id IS ?',
            id,
            customerId,
          )
        : null,
    locationChanged && target
      ? db.stmt(
          `INSERT INTO item_locations (item_id, shelf_id, zone_id, side, customer_id)
           VALUES (?, ?, ?, ?, ?)`,
          id,
          columns.shelf_id,
          columns.zone_id,
          columns.side,
          customerId,
        )
      : null,
    fieldsChanged ? movementStatement(db, { item: next, user, action: 'update' }) : null,
    // Un simple changement de côté sur la même étagère n'est pas un mouvement.
    movedElsewhere
      ? movementStatement(db, {
          item: next,
          user,
          action: 'move',
          from: current,
          to: target ? { ...target, customer_name: customer?.name ?? '' } : null,
        })
      : null,
  ]);

  return c.json(await findItemById(db, id));
});

/** Déplacement d'un article (glisser-déposer sur le plan, ou choix explicite). */
items.put('/:id/location', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);
  const user = await requireUser(db, c, payload);
  const item = await findItemById(db, id);

  if (!isPhysical(item.kind)) {
    throw badRequest('Un article Service ou Hors PlanStock n’a pas d’emplacement physique.');
  }

  const target = await readLocation(db, payload);
  if (!target) throw badRequest('Choisissez une étagère ou une zone de destination.');

  const customer = await readLocationCustomer(db, payload, target);
  const customerId = customer?.id ?? null;

  // Un article peut être rangé à plusieurs endroits à la fois : au stock global
  // et réservé chez un ou plusieurs clients. On ne déplace donc que
  // l'exemplaire du propriétaire visé — sinon déplacer celui du stock global
  // effacerait au passage la réservation d'AOCCI.
  const current = item.locations.find((row) => (row.customer_id ?? null) === customerId) ?? null;

  if (current?.code === target.code) {
    // Même étagère : seul le côté peut avoir changé. Pas un mouvement.
    if ((current.side ?? null) !== (target.side ?? null)) {
      // `IS` et non `=` : avec un paramètre NULL, `=` ne rapproche jamais rien,
      // et le côté du stock global ne serait pas mis à jour.
      await db.run(
        'UPDATE item_locations SET side = ? WHERE item_id = ? AND customer_id IS ?',
        target.side ?? null,
        id,
        customerId,
      );
      return c.json(await findItemById(db, id));
    }
    return c.json(item);
  }

  const columns = locationColumns(target);

  await db.batch([
    db.stmt('DELETE FROM item_locations WHERE item_id = ? AND customer_id IS ?', id, customerId),
    db.stmt(
      `INSERT INTO item_locations (item_id, shelf_id, zone_id, side, customer_id)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      columns.shelf_id,
      columns.zone_id,
      columns.side,
      customerId,
    ),
    db.stmt('UPDATE items SET updated_at = ? WHERE id = ?', new Date().toISOString(), id),
    movementStatement(db, {
      item,
      user,
      action: 'move',
      from: current,
      to: { ...target, customer_name: customer?.name ?? '' },
    }),
  ]);

  return c.json(await findItemById(db, id));
});

items.delete('/:id', async (c) => {
  const db = c.get('db');
  const id = routeId(c);
  const payload = await body(c);
  const user = await requireUser(db, c, payload);
  const item = await findItemById(db, id);

  await db.batch([
    movementStatement(db, { item, user, action: 'delete', from: item.locations[0] ?? null }),
    db.stmt('DELETE FROM items WHERE id = ?', id),
  ]);

  return c.json({ deleted: true, id, reference: item.reference_display });
});

export { KINDS };
