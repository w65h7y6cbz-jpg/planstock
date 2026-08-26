import { beforeEach, describe, expect, it } from 'vitest';
import { api, createContext, createRack, createZone, shelfIdOf, anonymousApi } from './helpers.js';

let context;
let rack;

beforeEach(async () => {
  context = await createContext();
  rack = await createRack({ shelves_count: 5 });
});

const postItem = (body) =>
  api('/api/items', { method: 'POST', json: { user_id: context.userId, ...body } });

describe('POST /api/items', () => {
  it('crée un article physique et le range sur une étagère', async () => {
    const response = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });

    expect(response.status).toBe(201);
    expect(response.body.reference).toBe('ARB123');
    expect(response.body.locations[0]).toMatchObject({ kind: 'shelf', code: 'R01-E2' });
  });

  it('pose un article directement sur une zone', async () => {
    const zone = await createZone({ label: 'Pile ProDesk' });
    const response = await postItem({
      reference: 'B39VLAT',
      designation: 'Copieur B39',
      zone_id: zone.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.locations[0]).toMatchObject({
      kind: 'zone',
      code: 'Z01',
      rack_label: 'Pile ProDesk',
      shelf_index: null,
    });
  });

  it('refuse une étagère et une zone à la fois', async () => {
    const zone = await createZone();
    const response = await postItem({
      reference: 'ARB123',
      shelf_id: shelfIdOf(rack, 1),
      zone_id: zone.id,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('pas les deux');
  });

  it('accepte une famille Sage facultative et la conserve telle quelle', async () => {
    const response = await postItem({
      reference: 'ARB123',
      family_code: '0310',
      family_label: 'IMPRIMANTE LASER N/B TGC22',
      shelf_id: shelfIdOf(rack, 1),
    });

    expect(response.body.family_code).toBe('0310');
    expect(response.body.family_label).toBe('IMPRIMANTE LASER N/B TGC22');

    const sansFamille = await postItem({ reference: 'B39VLAT', shelf_id: shelfIdOf(rack, 2) });
    expect(sansFamille.body.family_code).toBeNull();
  });

  it('conserve la référence telle que saisie et la normalise pour la recherche', async () => {
    const response = await postItem({ reference: 'UK707E/L', shelf_id: shelfIdOf(rack, 1) });
    expect(response.body.reference_display).toBe('UK707E/L');
    expect(response.body.reference).toBe('UK707EL');
  });

  it('refuse toute modification sans prénom sélectionné', async () => {
    const response = await anonymousApi('/api/items', {
      method: 'POST',
      json: { reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('prénom');
  });

  it('refuse une référence déjà présente', async () => {
    await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });
    const response = await postItem({ reference: 'arb-123', shelf_id: shelfIdOf(rack, 2) });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('existe déjà');
  });

  it('exige un emplacement pour un article physique', async () => {
    const response = await postItem({ reference: 'ARB123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('étagère');
  });

  it('crée un article de type service sans emplacement', async () => {
    const response = await postItem({
      reference: 'DEPITUC',
      designation: 'Éco-participation',
      kind: 'service',
    });

    expect(response.status).toBe(201);
    expect(response.body.locations).toHaveLength(0);
  });

  it('refuse un emplacement sur un article de type service', async () => {
    const response = await postItem({
      reference: 'DEPITUC',
      kind: 'service',
      shelf_id: shelfIdOf(rack, 1),
    });
    expect(response.status).toBe(400);
  });

  it('journalise la création au nom du prénom sélectionné', async () => {
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });

    const { body } = await api('/api/movements');
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      action: 'create',
      item_reference: 'ARB123',
      user_first_name: 'Daniel',
      to_code: 'R01-E2',
    });
  });
});

describe('GET /api/items/search', () => {
  beforeEach(async () => {
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });
    await postItem({ reference: 'ARB456', designation: 'Imprimante A4', shelf_id: shelfIdOf(rack, 1) });
    await postItem({ reference: 'UK707E/L', designation: 'Toner', shelf_id: shelfIdOf(rack, 3) });
    await postItem({ reference: 'DEPITUC', designation: 'Redevance', kind: 'service' });
  });

  it('trouve une référence saisie avec tirets et minuscules', async () => {
    const { body } = await api('/api/items/search?q=arb-123');
    expect(body.exact.reference).toBe('ARB123');
    expect(body.exact.locations[0].code).toBe('R01-E2');
  });

  it('retrouve UK707E/L en tapant uk707el et le réaffiche tel que saisi', async () => {
    const { body } = await api('/api/items/search?q=uk707el');
    expect(body.exact.reference_display).toBe('UK707E/L');
  });

  it('propose les correspondances par préfixe', async () => {
    const { body } = await api('/api/items/search?q=arb');
    expect(body.exact).toBeNull();
    expect(body.matches.map((item) => item.reference)).toEqual(['ARB123', 'ARB456']);
  });

  it('renvoie un résultat vide pour une référence inconnue', async () => {
    const { body } = await api('/api/items/search?q=INCONNU999');
    expect(body.exact).toBeNull();
    expect(body.matches).toHaveLength(0);
  });

  it('trouve un article posé sur une zone', async () => {
    const zone = await createZone({ label: 'Pile ProDesk', code: 2 });
    await postItem({ reference: 'B39VLAT', designation: 'Copieur B39', zone_id: zone.id });

    const { body } = await api('/api/items/search?q=b39vlat');
    expect(body.exact.locations[0].code).toBe('Z02');
    expect(body.exact.locations[0].rack_label).toBe('Pile ProDesk');
  });
});

describe('PUT /api/items/:id/location', () => {
  it('déplace un article d’une étagère à l’autre et journalise le mouvement', async () => {
    const created = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });

    const response = await api(`/api/items/${created.body.id}/location`, { method: 'PUT', json: { user_id: context.userId, shelf_id: shelfIdOf(rack, 1) } });

    expect(response.status).toBe(200);
    expect(response.body.locations[0].code).toBe('R01-E1');

    const { body: movements } = await api('/api/movements?reference=ARB123');
    expect(movements[0]).toMatchObject({
      action: 'move',
      from_code: 'R01-E2',
      to_code: 'R01-E1',
      user_first_name: 'Daniel',
    });
  });

  it('déplace un article d’une étagère vers une zone', async () => {
    const zone = await createZone({ code: 2 });
    const created = await postItem({ reference: 'B39VLAT', shelf_id: shelfIdOf(rack, 3) });

    const response = await api(`/api/items/${created.body.id}/location`, { method: 'PUT', json: { user_id: context.userId, zone_id: zone.id } });

    expect(response.status).toBe(200);
    expect(response.body.locations[0].code).toBe('Z02');

    const { body: movements } = await api('/api/movements?reference=B39VLAT');
    expect(movements[0]).toMatchObject({ from_code: 'R01-E3', to_code: 'Z02' });
  });

  it('refuse de déplacer un article sans prénom sélectionné', async () => {
    const created = await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });
    const response = await anonymousApi(`/api/items/${created.body.id}/location`, {
      method: 'PUT',
      json: { shelf_id: shelfIdOf(rack, 2) },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('prénom');
  });
});

describe('PATCH et DELETE /api/items/:id', () => {
  it('bascule un article physique en service et libère son étagère', async () => {
    const created = await postItem({ reference: 'DEPITUC', shelf_id: shelfIdOf(rack, 1) });

    const response = await api(`/api/items/${created.body.id}`, { method: 'PATCH', json: { user_id: context.userId, kind: 'service' } });

    expect(response.status).toBe(200);
    expect(response.body.locations).toHaveLength(0);
  });

  it('modifie désignation et famille et journalise une mise à jour', async () => {
    const created = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });

    const response = await api(`/api/items/${created.body.id}`, { method: 'PATCH', json: {
        user_id: context.userId,
        designation: 'Imprimante A3 couleur',
        family_code: '0310',
      } });

    expect(response.status).toBe(200);
    expect(response.body.locations[0].code).toBe('R01-E2');

    const { body: movements } = await api('/api/movements?reference=ARB123');
    expect(movements.map((movement) => movement.action)).toEqual(['update', 'create']);
  });

  it('supprime un article en gardant la trace dans l’historique', async () => {
    const created = await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });

    const response = await api(`/api/items/${created.body.id}`, { method: 'DELETE', json: { user_id: context.userId } });

    expect(response.status).toBe(200);
    expect((await api('/api/items')).body).toHaveLength(0);

    const { body: movements } = await api('/api/movements?reference=ARB123');
    expect(movements[0]).toMatchObject({ action: 'delete', from_code: 'R01-E2' });
  });
});

describe('GET /api/export', () => {
  it('exporte les articles en CSV avec les en-têtes attendus', async () => {
    const zone = await createZone({ code: 2, label: 'Pile ProDesk' });
    await postItem({
      reference: 'ARB123',
      designation: 'Imprimante A3',
      shelf_id: shelfIdOf(rack, 2),
    });
    await postItem({ reference: 'B39VLAT', designation: 'Copieur B39', zone_id: zone.id });
    await postItem({ reference: 'DEPITUC', designation: 'Redevance', kind: 'service' });

    const response = await api('/api/export/csv');
    const lines = response.text.replace(/^﻿/, '').trim().split('\r\n');

    expect(lines[0]).toBe(
      'Référence;Désignation;Famille;Libellé famille;Type;Local;Emplacement;Réservé à;Côté',
    );
    // Colonne « Réservé à » vide : ces articles sont au stock global.
    expect(lines).toContain('ARB123;Imprimante A3;;;Physique;Optimium;R01-E2;;');
    expect(lines).toContain('B39VLAT;Copieur B39;;;Physique;Optimium;Z02;;');
    // Un service n'a ni local ni emplacement.
    expect(lines).toContain('DEPITUC;Redevance;;;Service;;;;');
  });

  it('exporte le côté d’étagère quand il est renseigné', async () => {
    const rack = await createRack();
    await postItem({
      reference: 'UK707E/L',
      designation: 'Toner noir',
      shelf_id: shelfIdOf(rack, 1),
      side: 'right',
    });

    const response = await api('/api/export/csv');
    expect(response.text).toContain(
      `UK707E/L;Toner noir;;;Physique;Optimium;${rack.rack_code}-E1;;Droite`,
    );
  });

  it('limite l’export au local demandé', async () => {
    const optimium = await createRack({ site_id: context.siteId });
    const sharp = await createRack({ site_id: context.otherSiteId });
    await postItem({ reference: 'ICI1', shelf_id: shelfIdOf(optimium, 1) });
    await postItem({ reference: 'LABAS1', shelf_id: shelfIdOf(sharp, 1) });

    const response = await api(`/api/export/csv?site_id=${context.siteId}`);
    expect(response.text).toContain('ICI1');
    expect(response.text).not.toContain('LABAS1');
  });

  // Le fichier Excel est fabriqué dans le navigateur : le Worker ne livre que
  // les lignes, dans le même ordre et avec les mêmes en-têtes que le CSV.
  it('livre les lignes de l’export pour que le navigateur en fasse un .xlsx', async () => {
    const grandRayon = await createRack({ shelves_count: 20 });

    for (let index = 0; index < 20; index += 1) {
      await postItem({
        reference: `REF${String(index + 1).padStart(3, '0')}`,
        designation: `Article ${index + 1}`,
        shelf_id: grandRayon.shelves[index].id,
      });
    }

    const response = await api('/api/export/rows');
    expect(response.status).toBe(200);
    expect(response.body.headers).toEqual([
      'Référence',
      'Désignation',
      'Famille',
      'Libellé famille',
      'Type',
      'Local',
      'Emplacement',
      'Réservé à',
      'Côté',
    ]);
    expect(response.body.rows).toHaveLength(20);
    expect(response.body.rows[0]).toEqual([
      'REF001',
      'Article 1',
      '',
      '',
      'Physique',
      'Optimium',
      'R02-E1',
      '',
      '',
    ]);
  });
});

describe('GET /api/health', () => {
  it('signale une base remplie une fois le premier rayonnage posé', async () => {
    // `rack` est créé avant chaque test : la base n'est plus vide.
    expect((await api('/api/health')).body.empty).toBe(false);
    expect((await api('/api/health')).body.counts.sites).toBe(2);
  });
});
