import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createRack, createTestContext, createZone, shelfIdOf } from './helpers.js';

let context;

beforeEach(() => {
  context = createTestContext();
});

describe('POST /api/racks — rayonnages', () => {
  it('génère automatiquement les étagères du rayonnage', async () => {
    const rack = await createRack(request, context.app, {
      label: 'Rayon imprimantes',
      shelves_count: 5,
    });

    expect(rack.code).toBe(1);
    expect(rack.rack_code).toBe('R01');
    expect(rack.is_zone).toBe(false);
    expect(rack.shelves).toHaveLength(5);
    expect(rack.shelves.map((shelf) => shelf.code)).toEqual([
      'R01-E1',
      'R01-E2',
      'R01-E3',
      'R01-E4',
      'R01-E5',
    ]);
  });

  it('crée cinq étagères par défaut', async () => {
    const response = await request(context.app).post('/api/racks').send({ label: 'Sans précision' });
    expect(response.body.shelves_count).toBe(5);
  });

  it('enregistre un libellé d’allée', async () => {
    const rack = await createRack(request, context.app, { aisle: 'Allée B' });
    expect(rack.aisle).toBe('Allée B');
  });

  it('numérote les rayonnages suivants automatiquement', async () => {
    await createRack(request, context.app);
    expect((await createRack(request, context.app)).rack_code).toBe('R02');
  });

  it('refuse un numéro déjà utilisé', async () => {
    await createRack(request, context.app, { code: 5 });
    const response = await request(context.app)
      .post('/api/racks')
      .send({ code: 5, shelves_count: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('R05');
  });

  it('refuse un nombre d’étagères invalide', async () => {
    const response = await request(context.app).post('/api/racks').send({ shelves_count: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('étagères');
  });
});

describe('POST /api/racks — zones', () => {
  it('crée une zone sans étagère avec un code Z', async () => {
    const zone = await createZone(request, context.app, { label: 'Pile ProDesk' });

    expect(zone.rack_code).toBe('Z01');
    expect(zone.is_zone).toBe(true);
    expect(zone.shelves_count).toBe(0);
    expect(zone.shelves).toHaveLength(0);
    expect(zone.items).toHaveLength(0);
  });

  it('numérote les zones indépendamment des rayonnages', async () => {
    await createRack(request, context.app);
    const zone = await createZone(request, context.app);
    expect(zone.rack_code).toBe('Z01');

    // R01 et Z01 coexistent sans conflit.
    const rows = (await request(context.app).get('/api/racks')).body;
    expect(rows.map((row) => row.rack_code).sort()).toEqual(['R01', 'Z01']);
  });

  it('ignore un nombre d’étagères demandé pour une zone', async () => {
    const zone = await createZone(request, context.app, { shelves_count: 4 });
    expect(zone.shelves_count).toBe(0);
  });

  it('refuse de transformer un rayonnage en zone', async () => {
    const rack = await createRack(request, context.app);
    const response = await request(context.app)
      .patch(`/api/racks/${rack.id}`)
      .send({ kind: 'zone' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('supprimez-le');
  });
});

describe('PATCH /api/racks/:id', () => {
  it('ajoute les étagères manquantes quand le rayonnage grandit', async () => {
    const rack = await createRack(request, context.app, { shelves_count: 2 });
    const response = await request(context.app)
      .patch(`/api/racks/${rack.id}`)
      .send({ shelves_count: 6 });

    expect(response.status).toBe(200);
    expect(response.body.shelves).toHaveLength(6);
  });

  it('refuse de supprimer une étagère encore occupée', async () => {
    const rack = await createRack(request, context.app, { shelves_count: 3 });
    await request(context.app).post('/api/items').send({
      user_id: context.userId,
      reference: 'ARB123',
      shelf_id: shelfIdOf(rack, 3),
    });

    const response = await request(context.app)
      .patch(`/api/racks/${rack.id}`)
      .send({ shelves_count: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('R01-E3');
  });

  it('enregistre la position du rectangle sur la vue de dessus', async () => {
    const rack = await createRack(request, context.app);
    const response = await request(context.app)
      .patch(`/api/racks/${rack.id}`)
      .send({ x: 42.5, y: 10, width: 20, height: 12 });

    expect(response.status).toBe(200);
    expect(response.body.x).toBe(42.5);
    expect(response.body.y).toBe(10);
  });
});

describe('DELETE /api/racks/:id', () => {
  it('supprime un rayonnage vide', async () => {
    const rack = await createRack(request, context.app);
    expect((await request(context.app).delete(`/api/racks/${rack.id}`)).status).toBe(200);
    expect((await request(context.app).get('/api/racks')).body).toHaveLength(0);
  });

  it('refuse de supprimer un rayonnage qui contient des articles', async () => {
    const rack = await createRack(request, context.app);
    await request(context.app)
      .post('/api/items')
      .send({ user_id: context.userId, reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });

    const response = await request(context.app).delete(`/api/racks/${rack.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('article');
  });

  it('refuse de supprimer une zone qui porte des articles', async () => {
    const zone = await createZone(request, context.app);
    await request(context.app)
      .post('/api/items')
      .send({ user_id: context.userId, reference: 'B39VLAT', zone_id: zone.id });

    const response = await request(context.app).delete(`/api/racks/${zone.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('Z01');
  });
});
