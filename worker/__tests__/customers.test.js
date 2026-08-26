import { beforeEach, describe, expect, it } from 'vitest';
import { api, createContext, createRack, createZone, shelfIdOf } from './helpers.js';

/**
 * Sous-stocks réservés à un client.
 *
 * Le cas qui compte : la même référence au stock global et réservée chez un
 * client, parfois sur la même étagère. Ce qui se joue ici, c'est qu'un
 * magasinier ne parte jamais avec la pile du voisin.
 */

let context;

beforeEach(async () => {
  context = await createContext();
});

const postItem = (payload) =>
  api('/api/items', { method: 'POST', json: { user_id: context.userId, ...payload } });

const createCustomer = (payload = {}) =>
  api('/api/customers', {
    method: 'POST',
    json: { site_id: context.siteId, name: 'AOCCI', ...payload },
  });

const search = (query) => api(`/api/items/search?${query}`);

describe('sous-stocks — le carnet des clients', () => {
  it('crée un sous-stock dans un local, vide au départ', async () => {
    const { status, body } = await createCustomer();

    expect(status).toBe(201);
    expect(body).toMatchObject({ name: 'AOCCI', site_id: context.siteId, reserved_count: 0 });
  });

  it('refuse deux fois le même nom dans le même local', async () => {
    await createCustomer();
    const { status, body } = await createCustomer();

    expect(status).toBe(409);
    expect(body.error).toMatch(/AOCCI/);
  });

  it('accepte le même nom dans l’autre local : ce sont deux carnets séparés', async () => {
    await createCustomer();
    const { status } = await createCustomer({ site_id: context.otherSiteId });

    expect(status).toBe(201);
  });

  it('refuse un nom vide', async () => {
    const { status } = await createCustomer({ name: '   ' });
    expect(status).toBe(400);
  });

  it('ne liste que les sous-stocks du local demandé', async () => {
    await createCustomer({ name: 'AOCCI' });
    await createCustomer({ name: 'Mairie', site_id: context.otherSiteId });

    const { body } = await api(`/api/customers?site_id=${context.siteId}`);
    expect(body.map((row) => row.name)).toEqual(['AOCCI']);
  });

  it('renomme un sous-stock', async () => {
    const { body: customer } = await createCustomer();
    const { status, body } = await api(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      json: { name: 'AOCCI Nouméa' },
    });

    expect(status).toBe(200);
    expect(body.name).toBe('AOCCI Nouméa');
  });
});

describe('réserver une référence à un client', () => {
  it('range la même référence au stock global et chez un client, sur la même étagère', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const shelf = shelfIdOf(rack, 1);
    const { body: customer } = await createCustomer();

    // Le stock global d'abord.
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelf });
    expect(item.locations).toHaveLength(1);

    // Puis l'exemplaire réservé, au même endroit : c'est le cas que l'ancien
    // index d'unicité interdisait.
    const { status } = await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelf, customer_id: customer.id },
    });
    expect(status).toBe(200);

    const { body: after } = await api(`/api/items/${item.id}`);
    expect(after.locations).toHaveLength(2);
    expect(after.locations.map((row) => row.customer_name).sort()).toEqual(['', 'AOCCI']);
  });

  it('déplacer l’exemplaire du stock global laisse la réservation en place', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: customer } = await createCustomer();
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 2), customer_id: customer.id },
    });

    // On déplace le global : la réservation d'AOCCI ne doit pas bouger.
    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 3) },
    });

    const { body: after } = await api(`/api/items/${item.id}`);
    const parClient = Object.fromEntries(
      after.locations.map((row) => [row.customer_name || 'global', row.code]),
    );
    expect(parClient).toEqual({ global: `R0${rack.code}-E3`, AOCCI: `R0${rack.code}-E2` });
  });

  it('refuse de réserver à un client d’un autre local', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: ailleurs } = await createCustomer({ site_id: context.otherSiteId });
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    const { status, body } = await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 2), customer_id: ailleurs.id },
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/sous-stock de ce local/);
  });

  it('note le sous-stock dans l’historique, pour qu’il reste lisible plus tard', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: customer } = await createCustomer();
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 2), customer_id: customer.id },
    });

    const { body: movements } = await api('/api/movements?reference=UK707E/L');
    expect(movements.some((row) => row.to_code?.includes('· AOCCI'))).toBe(true);
  });
});

describe('la recherche par défaut ne voit que le stock global', () => {
  it('trouve la référence au stock global, et l’ignore depuis un sous-stock vide', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: customer } = await createCustomer();
    await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    const global = await search(`q=UK707E/L&site_id=${context.siteId}`);
    expect(global.body.exact?.locations?.[0]?.code).toBe(`R0${rack.code}-E1`);

    // Rien n'est réservé à AOCCI : depuis chez eux, la référence est inconnue.
    const chezAocci = await search(
      `q=UK707E/L&site_id=${context.siteId}&customer_id=${customer.id}`,
    );
    expect(chezAocci.body.exact).toBeNull();
  });

  it('depuis un sous-stock, ne ramène que l’emplacement réservé', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const zone = await createZone({ site_id: context.siteId });
    const { body: customer } = await createCustomer();
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, zone_id: zone.id, customer_id: customer.id },
    });

    const chezAocci = await search(
      `q=UK707E/L&site_id=${context.siteId}&customer_id=${customer.id}`,
    );
    expect(chezAocci.body.exact.locations).toHaveLength(1);
    expect(chezAocci.body.exact.locations[0]).toMatchObject({
      code: `Z0${zone.code}`,
      customer_name: 'AOCCI',
    });

    // Et le stock global ne montre toujours que le sien.
    const global = await search(`q=UK707E/L&site_id=${context.siteId}`);
    expect(global.body.exact.locations).toHaveLength(1);
    expect(global.body.exact.locations[0].customer_name).toBe('');
  });

  it('laisse trouver un article Service quel que soit le sous-stock regardé', async () => {
    const { body: customer } = await createCustomer();
    await postItem({ reference: 'DEPITUC', kind: 'service' });

    const chezAocci = await search(
      `q=DEPITUC&site_id=${context.siteId}&customer_id=${customer.id}`,
    );
    expect(chezAocci.body.exact?.reference).toBe('DEPITUC');
  });

  it('refuse un sous-stock qui n’est pas celui du local cherché', async () => {
    const { body: ailleurs } = await createCustomer({ site_id: context.otherSiteId });
    const { status } = await search(`q=UK707E/L&site_id=${context.siteId}&customer_id=${ailleurs.id}`);

    expect(status).toBe(400);
  });
});

describe('supprimer un sous-stock', () => {
  it('supprime un sous-stock vide', async () => {
    const { body: customer } = await createCustomer();
    const { status } = await api(`/api/customers/${customer.id}`, { method: 'DELETE' });

    expect(status).toBe(200);
    const { body } = await api(`/api/customers?site_id=${context.siteId}`);
    expect(body).toEqual([]);
  });

  it('refuse tant qu’il reste des références réservées, sans rien effacer', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: customer } = await createCustomer();
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 2), customer_id: customer.id },
    });

    const { status, body } = await api(`/api/customers/${customer.id}`, { method: 'DELETE' });
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 référence/);

    // L'article n'a rien perdu : c'est tout l'intérêt du refus.
    const { body: after } = await api(`/api/items/${item.id}`);
    expect(after.locations).toHaveLength(2);
  });

  it('compte les références réservées à chacun', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: customer } = await createCustomer();
    const { body: item } = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });

    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 2), customer_id: customer.id },
    });

    const { body } = await api(`/api/customers?site_id=${context.siteId}`);
    expect(body[0].reserved_count).toBe(1);
  });
});
