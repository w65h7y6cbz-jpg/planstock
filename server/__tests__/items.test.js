import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createRack, createTestContext, slotIdOf } from './helpers.js';

let context;
let rack;

beforeEach(async () => {
  context = createTestContext();
  rack = await createRack(request, context.app, { shelves_count: 3, slots_per_shelf: 4 });
});

const postItem = (body) =>
  request(context.app)
    .post('/api/items')
    .send({ user_id: context.userId, ...body });

describe('POST /api/items', () => {
  it('crée un article physique et le range dans une case', async () => {
    const response = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      slot_id: slotIdOf(rack, 2, 4),
    });

    expect(response.status).toBe(201);
    expect(response.body.reference).toBe('ARB123');
    expect(response.body.locations[0].code).toBe('R01-E2-C4');
  });

  it('accepte une famille Sage facultative et la conserve telle quelle', async () => {
    const response = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      family_code: '0310',
      family_label: 'IMPRIMANTE LASER N/B TGC22',
      slot_id: slotIdOf(rack, 1, 1),
    });

    expect(response.status).toBe(201);
    expect(response.body.family_code).toBe('0310');
    expect(response.body.family_label).toBe('IMPRIMANTE LASER N/B TGC22');

    const sansFamille = await postItem({ reference: 'B39VLAT', slot_id: slotIdOf(rack, 1, 2) });
    expect(sansFamille.body.family_code).toBeNull();
    expect(sansFamille.body.family_label).toBeNull();
  });

  it('conserve la référence telle que saisie et la normalise pour la recherche', async () => {
    const response = await postItem({
      reference: 'UK707E/L',
      designation: 'Toner',
      slot_id: slotIdOf(rack, 1, 1),
    });

    expect(response.body.reference_display).toBe('UK707E/L');
    expect(response.body.reference).toBe('UK707EL');
  });

  it('refuse toute modification sans prénom sélectionné', async () => {
    const response = await request(context.app)
      .post('/api/items')
      .send({ reference: 'ARB123', slot_id: slotIdOf(rack, 1, 1) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('prénom');
  });

  it('refuse une référence déjà présente', async () => {
    await postItem({ reference: 'ARB123', slot_id: slotIdOf(rack, 1, 1) });
    const response = await postItem({ reference: 'arb-123', slot_id: slotIdOf(rack, 1, 2) });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('existe déjà');
  });

  it('exige un emplacement pour un article physique', async () => {
    const response = await postItem({ reference: 'ARB123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('case');
  });

  it('crée un article de type service sans emplacement', async () => {
    const response = await postItem({
      reference: 'DEPITUC',
      designation: 'Éco-participation',
      kind: 'service',
    });

    expect(response.status).toBe(201);
    expect(response.body.kind).toBe('service');
    expect(response.body.locations).toHaveLength(0);
  });

  it('refuse un emplacement sur un article de type service', async () => {
    const response = await postItem({
      reference: 'DEPITUC',
      kind: 'service',
      slot_id: slotIdOf(rack, 1, 1),
    });

    expect(response.status).toBe(400);
  });

  it('journalise la création au nom du prénom sélectionné', async () => {
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      slot_id: slotIdOf(rack, 2, 4),
    });

    const { body } = await request(context.app).get('/api/movements');
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      action: 'create',
      item_reference: 'ARB123',
      user_first_name: 'Daniel',
      to_slot_code: 'R01-E2-C4',
    });
    expect(body[0].created_at).toBeTruthy();
  });
});

describe('GET /api/items/search', () => {
  beforeEach(async () => {
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      slot_id: slotIdOf(rack, 2, 4),
    });
    await postItem({
      reference: 'ARB456',
      designation: 'Imprimante A4',
      slot_id: slotIdOf(rack, 1, 1),
    });
    await postItem({ reference: 'UK707E/L', designation: 'Toner', slot_id: slotIdOf(rack, 3, 2) });
    await postItem({ reference: 'DEPITUC', designation: 'Redevance', kind: 'service' });
  });

  it('trouve une référence saisie avec tirets et minuscules', async () => {
    const { body } = await request(context.app).get('/api/items/search?q=arb-123');
    expect(body.exact.reference).toBe('ARB123');
    expect(body.exact.locations[0].code).toBe('R01-E2-C4');
  });

  it('retrouve UK707E/L en tapant uk707el et le réaffiche tel que saisi', async () => {
    const { body } = await request(context.app).get('/api/items/search?q=uk707el');
    expect(body.exact.reference_display).toBe('UK707E/L');
  });

  it('propose les correspondances par préfixe', async () => {
    const { body } = await request(context.app).get('/api/items/search?q=arb');
    expect(body.exact).toBeNull();
    expect(body.matches.map((item) => item.reference)).toEqual(['ARB123', 'ARB456']);
  });

  it('renvoie un résultat vide pour une référence inconnue', async () => {
    const { body } = await request(context.app).get('/api/items/search?q=INCONNU999');
    expect(body.exact).toBeNull();
    expect(body.matches).toHaveLength(0);
  });

  it('renvoie les articles service sans emplacement', async () => {
    const { body } = await request(context.app).get('/api/items/search?q=depituc');
    expect(body.exact.kind).toBe('service');
    expect(body.exact.locations).toHaveLength(0);
  });
});

describe('PUT /api/items/:id/location', () => {
  it('déplace un article et journalise le mouvement', async () => {
    const created = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      slot_id: slotIdOf(rack, 2, 4),
    });

    const response = await request(context.app)
      .put(`/api/items/${created.body.id}/location`)
      .send({ user_id: context.userId, slot_id: slotIdOf(rack, 1, 1) });

    expect(response.status).toBe(200);
    expect(response.body.locations[0].code).toBe('R01-E1-C1');

    const { body: movements } = await request(context.app).get('/api/movements?reference=ARB123');
    expect(movements[0]).toMatchObject({
      action: 'move',
      from_slot_code: 'R01-E2-C4',
      to_slot_code: 'R01-E1-C1',
      user_first_name: 'Daniel',
    });
  });

  it('refuse de déplacer un article sans prénom sélectionné', async () => {
    const created = await postItem({ reference: 'ARB123', slot_id: slotIdOf(rack, 1, 1) });
    const response = await request(context.app)
      .put(`/api/items/${created.body.id}/location`)
      .send({ slot_id: slotIdOf(rack, 1, 2) });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('prénom');
  });
});

describe('PATCH et DELETE /api/items/:id', () => {
  it('bascule un article physique en service et libère sa case', async () => {
    const created = await postItem({ reference: 'DEPITUC', slot_id: slotIdOf(rack, 1, 1) });

    const response = await request(context.app)
      .patch(`/api/items/${created.body.id}`)
      .send({ user_id: context.userId, kind: 'service' });

    expect(response.status).toBe(200);
    expect(response.body.locations).toHaveLength(0);
  });

  it('supprime un article en gardant la trace dans l’historique', async () => {
    const created = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      slot_id: slotIdOf(rack, 2, 4),
    });

    const response = await request(context.app)
      .delete(`/api/items/${created.body.id}`)
      .send({ user_id: context.userId });

    expect(response.status).toBe(200);
    expect((await request(context.app).get('/api/items')).body).toHaveLength(0);

    const { body: movements } = await request(context.app).get('/api/movements?reference=ARB123');
    expect(movements[0]).toMatchObject({
      action: 'delete',
      item_reference: 'ARB123',
      from_slot_code: 'R01-E2-C4',
    });
  });
});

describe('GET /api/export', () => {
  it('exporte les articles en CSV avec les en-têtes attendus', async () => {
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      slot_id: slotIdOf(rack, 2, 4),
    });
    await postItem({ reference: 'DEPITUC', designation: 'Redevance', kind: 'service' });

    const response = await request(context.app).get('/api/export/csv');
    expect(response.status).toBe(200);

    const lines = response.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Référence;Désignation;Famille;Libellé famille;Type;Emplacement');
    expect(lines).toContain('ARB123;Imprimante A3;;;Physique;R01-E2-C4');
    expect(lines).toContain('DEPITUC;Redevance;;;Service;');
  });

  it('exporte le code et le libellé de famille quand ils sont connus', async () => {
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      family_code: '0310',
      family_label: 'IMPRIMANTE LASER N/B TGC22',
      slot_id: slotIdOf(rack, 2, 4),
    });

    const response = await request(context.app).get('/api/export/csv');
    const lines = response.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toContain(
      'ARB123;Imprimante A3;0310;IMPRIMANTE LASER N/B TGC22;Physique;R01-E2-C4',
    );
  });

  it('exporte 20 articles en xlsx : une ligne d’en-têtes + 20 lignes', async () => {
    const grandRayon = await createRack(request, context.app, {
      shelves_count: 5,
      slots_per_shelf: 5,
    });

    for (let index = 0; index < 20; index += 1) {
      await postItem({
        reference: `REF${String(index + 1).padStart(3, '0')}`,
        designation: `Article ${index + 1}`,
        slot_id: grandRayon.slots[index].id,
      });
    }

    const response = await request(context.app).get('/api/export/xlsx').responseType('blob');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const sheet = workbook.getWorksheet('Articles');

    expect(sheet.rowCount).toBe(21);
    expect(sheet.getRow(1).values.slice(1)).toEqual([
      'Référence',
      'Désignation',
      'Famille',
      'Libellé famille',
      'Type',
      'Emplacement',
    ]);
    expect(sheet.getRow(2).values.slice(1)).toEqual([
      'REF001',
      'Article 1',
      '',
      '',
      'Physique',
      'R02-E1-C1',
    ]);
  });
});

describe('GET /api/health', () => {
  it('signale une base vide pour déclencher l’inventaire initial', async () => {
    const vierge = createTestContext();
    const { body } = await request(vierge.app).get('/api/health');
    expect(body.empty).toBe(true);

    const { body: apresRayonnage } = await request(context.app).get('/api/health');
    expect(apresRayonnage.empty).toBe(false);
  });
});
