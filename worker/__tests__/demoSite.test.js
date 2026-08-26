import { beforeEach, describe, expect, it } from 'vitest';
import { actAs, anonymousApi, api, createContext } from './helpers.js';

/**
 * Le local de démonstration.
 *
 * Deux promesses à tenir, et ce sont elles que ces tests gardent :
 *
 * 1. **Il ne se voit pas.** L'écran de choix du local reste à deux tuiles pour
 *    l'équipe ; la démonstration ne s'ouvre que quand on la demande.
 * 2. **Il ne mord jamais sur le vrai stock.** On y déplace, on y supprime, on
 *    le remet à neuf — et Optimium ne bouge pas d'une ligne.
 */

describe('Local de démonstration', () => {
  let context;

  beforeEach(async () => {
    context = await createContext();
  });

  it('reste hors de la liste des locaux, sauf demande explicite', async () => {
    const { body: visibles } = await api('/api/sites');
    const { body: tous } = await api('/api/sites?hidden=1');

    expect(visibles.map((site) => site.code)).not.toContain('demo');
    expect(tous.map((site) => site.code)).toContain('demo');

    const demo = tous.find((site) => site.code === 'demo');
    expect(demo.hidden).toBe(true);
    expect(visibles.every((site) => site.hidden === false)).toBe(true);
  });

  it('reste lisible un par un, sinon régler le local le ferait disparaître', async () => {
    const { body: tous } = await api('/api/sites?hidden=1');
    const demo = tous.find((site) => site.code === 'demo');

    const { status, body } = await api(`/api/sites/${demo.id}`);
    expect(status).toBe(200);
    expect(body.code).toBe('demo');
  });

  it('s’installe avec ses meubles, ses stocks à part et ses réservations', async () => {
    const { status, body } = await api('/api/demo/site', { method: 'POST' });

    expect(status).toBe(201);
    expect(body.racks).toBeGreaterThan(0);
    expect(body.zones).toBeGreaterThan(0);
    expect(body.items).toBeGreaterThan(20);
    expect(body.customers).toBe(2);
    expect(body.reserved).toBeGreaterThan(0);
    // Base neuve : aucune référence n'appartient encore au vrai stock.
    expect(body.skipped).toEqual([]);

    const { body: sites } = await api('/api/sites?hidden=1');
    const demo = sites.find((site) => site.code === 'demo');
    expect(demo.racks_count).toBe(body.racks);
    expect(demo.items_count).toBe(body.items + body.reserved);
    // Le contour n'est pas un rectangle : c'est ce que la visite montre.
    expect(demo.outline).not.toBe('');
  });

  it('se remet à neuf sans rien empiler', async () => {
    const { body: premier } = await api('/api/demo/site', { method: 'POST' });
    const { body: second } = await api('/api/demo/site', { method: 'POST' });

    expect(second.items).toBe(premier.items);
    expect(second.reserved).toBe(premier.reserved);
    expect(second.customers).toBe(premier.customers);
    expect(second.skipped).toEqual([]);

    const { body: sites } = await api('/api/sites?hidden=1');
    const demo = sites.find((site) => site.code === 'demo');
    expect(demo.racks_count).toBe(premier.racks);
  });

  it('efface ce qu’une démonstration a laissé derrière elle', async () => {
    await api('/api/demo/site', { method: 'POST' });
    const { body: sites } = await api('/api/sites?hidden=1');
    const demo = sites.find((site) => site.code === 'demo');

    const { body: ajoute } = await api('/api/items', {
      method: 'POST',
      json: { reference: 'VISITEUR1', designation: 'Posé pendant la réunion' },
    });
    const { body: racks } = await api(`/api/racks?site_id=${demo.id}`);
    const { body: detail } = await api(`/api/racks/${racks[0].id}`);
    await api(`/api/items/${ajoute.id}/location`, {
      method: 'PUT',
      json: { shelf_id: detail.shelves[0].id },
    });

    await api('/api/demo/site', { method: 'POST' });

    // L'article posé pendant la démonstration est parti avec le reste.
    const { status } = await api(`/api/items/${ajoute.id}`);
    expect(status).toBe(404);
  });

  it('ne touche pas au vrai stock quand on remet la démo à neuf', async () => {
    // Un vrai article dans Optimium, rangé sur une vraie étagère.
    const { body: rack } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: context.siteId, code: 1, label: 'Vrai rayonnage', shelves_count: 3 },
    });
    const { body: vrai } = await api('/api/items', {
      method: 'POST',
      json: {
        reference: 'VRAIREF1',
        designation: 'Article du vrai stock',
        shelf_id: rack.shelves[0].id,
      },
    });

    await api('/api/demo/site', { method: 'POST' });
    await api('/api/demo/site', { method: 'POST' });

    const { status, body } = await api(`/api/items/${vrai.id}`);
    expect(status).toBe(200);
    expect(body.locations).toHaveLength(1);
    expect(body.locations[0].site_id).toBe(context.siteId);

    const { body: sites } = await api('/api/sites?hidden=1');
    const optimium = sites.find((site) => site.id === context.siteId);
    expect(optimium.items_count).toBe(1);
  });

  it('laisse au vrai stock une référence qu’il utilise déjà', async () => {
    // MX-3162 fait partie du jeu de démonstration. Ici, c'est une prestation
    // du vrai stock : elle n'est rangée nulle part, et rien ne doit l'effacer.
    const { body: prestation } = await api('/api/items', {
      method: 'POST',
      json: { reference: 'MX-3162', designation: 'Prestation du vrai stock', kind: 'service' },
    });

    const { body } = await api('/api/demo/site', { method: 'POST' });
    expect(body.skipped).toContain('MX3162');

    const { status, body: apres } = await api(`/api/items/${prestation.id}`);
    expect(status).toBe(200);
    expect(apres.designation).toBe('Prestation du vrai stock');
    expect(apres.kind).toBe('service');
  });

  it('enferme ses articles dans son local : la recherche d’Optimium les ignore', async () => {
    await api('/api/demo/site', { method: 'POST' });

    const ailleurs = await api(`/api/items/search?q=MX-3162&site_id=${context.siteId}`);
    expect(ailleurs.body.exact).toBeNull();
    expect(ailleurs.body.matches).toHaveLength(0);

    const { body: sites } = await api('/api/sites?hidden=1');
    const demo = sites.find((site) => site.code === 'demo');
    const dedans = await api(`/api/items/search?q=MX-3162&site_id=${demo.id}`);
    expect(dedans.body.exact.reference).toBe('MX3162');
  });

  it('n’apparaît ni dans l’export du stock ni dans l’état de la base', async () => {
    const { body: rack } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: context.siteId, code: 1, label: 'Vrai rayonnage', shelves_count: 2 },
    });
    await api('/api/items', {
      method: 'POST',
      json: { reference: 'VRAIREF1', designation: 'Vrai', shelf_id: rack.shelves[0].id },
    });
    await api('/api/demo/site', { method: 'POST' });

    // Un export du stock remis à la direction ne doit pas contenir trente
    // références inventées au milieu des vraies.
    const { body: complet } = await api('/api/export/rows');
    const references = complet.rows.map((row) => row[0]);
    expect(references).toEqual(['VRAIREF1']);

    const csv = await api('/api/export/csv');
    expect(csv.text).not.toMatch(/MX-3162/);

    // `empty` commande le mode Inventaire initial : une démonstration installée
    // avant la saisie du vrai stock ne doit pas faire croire à une base pleine.
    const { body: sante } = await api('/api/health');
    expect(sante.counts.sites).toBe(2);
    expect(sante.counts.items).toBe(1);
  });

  it('ne fait pas croire à une base remplie avant la saisie du vrai stock', async () => {
    await api('/api/demo/site', { method: 'POST' });
    const { body } = await api('/api/health');
    expect(body.empty).toBe(true);
  });

  it('demande le droit de toucher au plan pour remettre la démo à neuf', async () => {
    const { body: marc } = await api('/api/users', {
      method: 'POST',
      json: { first_name: 'Marc' },
    });
    await api(`/api/users/${marc.id}`, { method: 'PATCH', json: { can_admin: false } });

    actAs(marc.id);
    const refus = await api('/api/demo/site', { method: 'POST' });
    actAs(context.userId);

    expect(refus.status).toBe(403);

    // Sans prénom, c'est un 400 et non un 403 : on ne refuse pas un droit, on
    // demande d'abord qui parle.
    const anonyme = await anonymousApi('/api/demo/site', { method: 'POST' });
    expect(anonyme.status).toBe(400);
    expect(anonyme.body.error).toMatch(/prénom/i);
  });
});
