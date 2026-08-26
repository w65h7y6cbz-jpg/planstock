import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createRack, createTestContext, slotIdOf } from './helpers.js';

let context;

beforeEach(() => {
  context = createTestContext();
});

describe('POST /api/racks', () => {
  it('génère automatiquement toutes les cases du rayonnage', async () => {
    const rack = await createRack(request, context.app, {
      label: 'Rayon imprimantes',
      shelves_count: 3,
      slots_per_shelf: 4,
    });

    expect(rack.code).toBe(1);
    expect(rack.rack_code).toBe('R01');
    expect(rack.slots).toHaveLength(12);
    expect(rack.slots.map((slot) => slot.code)).toContain('R01-E2-C4');
    expect(rack.slots.every((slot) => slot.items.length === 0)).toBe(true);
  });

  it('numérote les rayonnages suivants automatiquement', async () => {
    await createRack(request, context.app);
    const second = await createRack(request, context.app);
    expect(second.code).toBe(2);
    expect(second.rack_code).toBe('R02');
  });

  it('refuse un numéro de rayonnage déjà utilisé', async () => {
    await createRack(request, context.app, { code: 5 });
    const response = await request(context.app)
      .post('/api/racks')
      .send({ code: 5, shelves_count: 2, slots_per_shelf: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('R05');
  });

  it('refuse des dimensions invalides avec un message en français', async () => {
    const response = await request(context.app)
      .post('/api/racks')
      .send({ shelves_count: 0, slots_per_shelf: 4 });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('étagères');
  });
});

describe('PATCH /api/racks/:id', () => {
  it('ajoute les cases manquantes quand le rayonnage grandit', async () => {
    const rack = await createRack(request, context.app, {
      shelves_count: 2,
      slots_per_shelf: 2,
    });

    const response = await request(context.app)
      .patch(`/api/racks/${rack.id}`)
      .send({ shelves_count: 3, slots_per_shelf: 3 });

    expect(response.status).toBe(200);
    expect(response.body.slots).toHaveLength(9);
  });

  it('refuse de réduire un rayonnage dont les cases supprimées sont occupées', async () => {
    const rack = await createRack(request, context.app, {
      shelves_count: 3,
      slots_per_shelf: 3,
    });

    await request(context.app).post('/api/items').send({
      user_id: context.userId,
      reference: 'ARB123',
      designation: 'Article de test',
      slot_id: slotIdOf(rack, 3, 3),
    });

    const response = await request(context.app)
      .patch(`/api/racks/${rack.id}`)
      .send({ shelves_count: 2, slots_per_shelf: 2 });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('R01-E3-C3');
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
    const response = await request(context.app).delete(`/api/racks/${rack.id}`);

    expect(response.status).toBe(200);
    expect((await request(context.app).get('/api/racks')).body).toHaveLength(0);
  });

  it('refuse de supprimer un rayonnage qui contient des articles', async () => {
    const rack = await createRack(request, context.app);
    await request(context.app).post('/api/items').send({
      user_id: context.userId,
      reference: 'ARB123',
      slot_id: slotIdOf(rack, 1, 1),
    });

    const response = await request(context.app).delete(`/api/racks/${rack.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('article');
  });
});
