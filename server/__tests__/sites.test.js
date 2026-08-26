import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createRack, createTestContext, createZone, shelfIdOf } from './helpers.js';

let context;

beforeEach(() => {
  context = createTestContext();
});

const postItem = (payload) =>
  request(context.app)
    .post('/api/items')
    .send({ user_id: context.userId, ...payload });

describe('GET /api/sites — les deux locaux', () => {
  it('livre Optimium et Sharp Center, vides, avec leur couleur', async () => {
    const { body: sites } = await request(context.app).get('/api/sites');

    expect(sites.map((site) => site.name)).toEqual(['Optimium', 'Sharp Center']);
    expect(sites.map((site) => site.code)).toEqual(['optimium', 'sharp-center']);
    expect(sites.every((site) => /^#[0-9a-f]{6}$/.test(site.accent))).toBe(true);
    expect(sites.map((site) => site.racks_count)).toEqual([0, 0]);
  });

  it('compte les rayonnages, zones et articles de chaque local', async () => {
    const rack = await createRack(request, context.app, { site_id: context.siteId });
    await createZone(request, context.app, { site_id: context.otherSiteId });
    await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });

    const { body: sites } = await request(context.app).get('/api/sites');
    expect(sites[0]).toMatchObject({ racks_count: 1, zones_count: 0, items_count: 1 });
    expect(sites[1]).toMatchObject({ racks_count: 0, zones_count: 1, items_count: 0 });
  });

  it('renomme un local et change sa couleur', async () => {
    const response = await request(context.app)
      .patch(`/api/sites/${context.siteId}`)
      .send({ name: 'Optimium Nouméa', accent: '#E30613' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Optimium Nouméa');
    expect(response.body.accent).toBe('#e30613');
  });

  it('refuse une couleur qui n’est pas un code hexadécimal', async () => {
    const response = await request(context.app)
      .patch(`/api/sites/${context.siteId}`)
      .send({ accent: 'rouge' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('hexadécimal');
  });

  it('refuse un logo qui contient un chemin', async () => {
    const response = await request(context.app)
      .patch(`/api/sites/${context.siteId}`)
      .send({ logo: '../../etc/passwd' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('nom de fichier');
  });

  it('refuse de rétrécir le plan sous un emplacement déjà posé', async () => {
    await createRack(request, context.app, {
      site_id: context.siteId,
      x: 70,
      y: 10,
      width: 25,
      height: 10,
    });

    const response = await request(context.app)
      .patch(`/api/sites/${context.siteId}`)
      .send({ plan_width: 50 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('trop petit');
  });
});

describe('emplacements rattachés à un local', () => {
  it('exige un local à la création d’un rayonnage', async () => {
    const response = await request(context.app).post('/api/racks').send({ shelves_count: 2 });
    expect(response.status).toBe(404);
    expect(response.body.error).toContain('Local introuvable');
  });

  it('laisse R01 exister dans les deux locaux sans conflit', async () => {
    const ici = await createRack(request, context.app, { site_id: context.siteId, code: 1 });
    const laBas = await createRack(request, context.app, { site_id: context.otherSiteId, code: 1 });

    expect(ici.rack_code).toBe('R01');
    expect(laBas.rack_code).toBe('R01');
    expect(ici.id).not.toBe(laBas.id);
  });

  it('numérote à partir de 1 dans chaque local', async () => {
    await createRack(request, context.app, { site_id: context.siteId });
    await createRack(request, context.app, { site_id: context.siteId });
    const premier = await createRack(request, context.app, { site_id: context.otherSiteId });

    expect(premier.rack_code).toBe('R01');
  });

  it('filtre la liste des rayonnages par local', async () => {
    await createRack(request, context.app, { site_id: context.siteId });
    await createRack(request, context.app, { site_id: context.otherSiteId });

    const { body: tous } = await request(context.app).get('/api/racks');
    const { body: ici } = await request(context.app).get(`/api/racks?site_id=${context.siteId}`);

    expect(tous).toHaveLength(2);
    expect(ici).toHaveLength(1);
    expect(ici[0].site_id).toBe(context.siteId);
  });
});

describe('recherche limitée au local sélectionné', () => {
  it('ne trouve pas un article rangé dans l’autre local', async () => {
    const laBas = await createRack(request, context.app, { site_id: context.otherSiteId });
    await postItem({ reference: 'LABAS1', shelf_id: shelfIdOf(laBas, 1) });

    const ici = await request(context.app).get(
      `/api/items/search?q=LABAS1&site_id=${context.siteId}`,
    );
    expect(ici.body.exact).toBeNull();

    const bonLocal = await request(context.app).get(
      `/api/items/search?q=LABAS1&site_id=${context.otherSiteId}`,
    );
    expect(bonLocal.body.exact.reference).toBe('LABAS1');
    expect(bonLocal.body.exact.locations[0].site_name).toBe('Sharp Center');
  });

  it('trouve un service depuis les deux locaux : il n’est rangé nulle part', async () => {
    await postItem({ reference: 'DEPITUC', designation: 'Redevance', kind: 'service' });

    for (const siteId of [context.siteId, context.otherSiteId]) {
      const response = await request(context.app).get(
        `/api/items/search?q=DEPITUC&site_id=${siteId}`,
      );
      expect(response.body.exact.reference).toBe('DEPITUC');
    }
  });

  it('propose les correspondances de désignation après celles de référence', async () => {
    const rack = await createRack(request, context.app, { site_id: context.siteId });
    await postItem({
      reference: 'TON123',
      designation: 'Toner noir',
      shelf_id: shelfIdOf(rack, 1),
    });
    await postItem({
      reference: 'UK707E/L',
      designation: 'Grand toner cyan',
      shelf_id: shelfIdOf(rack, 2),
    });

    const { body } = await request(context.app).get(
      `/api/items/search?q=TON&site_id=${context.siteId}`,
    );

    expect(body.matches.map((item) => item.reference)).toEqual(['TON123']);
    expect(body.by_designation.map((item) => item.reference_display)).toEqual(['UK707E/L']);
  });
});

describe('côté d’étagère', () => {
  it('enregistre gauche, centre ou droite, et accepte l’absence de côté', async () => {
    const rack = await createRack(request, context.app, { site_id: context.siteId });

    const avecCote = await postItem({ reference: 'AVEC1', shelf_id: shelfIdOf(rack, 1), side: 'right' });
    const sansCote = await postItem({ reference: 'SANS1', shelf_id: shelfIdOf(rack, 2) });

    expect(avecCote.body.locations[0].side).toBe('right');
    expect(avecCote.body.locations[0].code).toBe(`${rack.rack_code}-E1`);
    expect(sansCote.body.locations[0].side).toBeNull();
  });

  it('refuse un côté inconnu', async () => {
    const rack = await createRack(request, context.app, { site_id: context.siteId });
    const response = await postItem({
      reference: 'FAUX1',
      shelf_id: shelfIdOf(rack, 1),
      side: 'derriere',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Côté invalide');
  });

  it('ne journalise pas de mouvement pour un simple changement de côté', async () => {
    const rack = await createRack(request, context.app, { site_id: context.siteId });
    const item = await postItem({ reference: 'COTE1', shelf_id: shelfIdOf(rack, 1), side: 'left' });

    const moved = await request(context.app)
      .put(`/api/items/${item.body.id}/location`)
      .send({ user_id: context.userId, shelf_id: shelfIdOf(rack, 1), side: 'right' });

    expect(moved.body.locations[0].side).toBe('right');
    const { body: movements } = await request(context.app).get('/api/movements?reference=COTE1');
    expect(movements.map((movement) => movement.action)).toEqual(['create']);
  });

  it('ignore le côté sur une zone : une pile au sol n’a pas d’étagère', async () => {
    const zone = await createZone(request, context.app, { site_id: context.siteId });
    const item = await postItem({ reference: 'ZONE1', zone_id: zone.id, side: 'left' });

    expect(item.status).toBe(201);
    expect(item.body.locations[0].side).toBeNull();
  });
});

describe('repères du local', () => {
  it('pose une porte et un établi, et ne les mélange pas entre locaux', async () => {
    const porte = await request(context.app)
      .post('/api/landmarks')
      .send({ site_id: context.siteId, kind: 'door', x: 40, y: 0 });
    await request(context.app)
      .post('/api/landmarks')
      .send({ site_id: context.otherSiteId, kind: 'bench', label: 'Établi' });

    expect(porte.status).toBe(201);
    expect(porte.body.label).toBe('Entrée');

    const { body: ici } = await request(context.app).get(
      `/api/landmarks?site_id=${context.siteId}`,
    );
    expect(ici).toHaveLength(1);
    expect(ici[0].kind).toBe('door');
  });

  it('déplace puis supprime un repère', async () => {
    const { body: porte } = await request(context.app)
      .post('/api/landmarks')
      .send({ site_id: context.siteId, kind: 'door' });

    const moved = await request(context.app)
      .patch(`/api/landmarks/${porte.id}`)
      .send({ x: 62.5, y: 3 });
    expect(moved.body.x).toBe(62.5);

    expect((await request(context.app).delete(`/api/landmarks/${porte.id}`)).status).toBe(200);
    expect((await request(context.app).get('/api/landmarks')).body).toHaveLength(0);
  });

  it('refuse un type de repère inconnu', async () => {
    const response = await request(context.app)
      .post('/api/landmarks')
      .send({ site_id: context.siteId, kind: 'fenetre' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Type de repère');
  });
});
