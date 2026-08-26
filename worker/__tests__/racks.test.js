import { beforeEach, describe, expect, it } from 'vitest';
import { api, createContext, createRack, createZone, shelfIdOf } from './helpers.js';

let context;

beforeEach(async () => {
  context = await createContext();
});

describe('POST /api/racks — rayonnages', () => {
  it('génère automatiquement les étagères du rayonnage', async () => {
    const rack = await createRack({
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
    const response = await api('/api/racks', { method: 'POST', json: { site_id: context.siteId, label: 'Sans précision' } });
    expect(response.body.shelves_count).toBe(5);
  });

  it('enregistre un libellé d’allée', async () => {
    const rack = await createRack({ aisle: 'Allée B' });
    expect(rack.aisle).toBe('Allée B');
  });

  it('numérote les rayonnages suivants automatiquement', async () => {
    await createRack();
    expect((await createRack()).rack_code).toBe('R02');
  });

  it('refuse un numéro déjà utilisé', async () => {
    await createRack({ code: 5 });
    const response = await api('/api/racks', { method: 'POST', json: { site_id: context.siteId, code: 5, shelves_count: 2 } });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('R05');
  });

  it('refuse un nombre d’étagères invalide', async () => {
    const response = await api('/api/racks', { method: 'POST', json: { site_id: context.siteId, shelves_count: 0 } });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('étagères');
  });
});

describe('POST /api/racks — zones', () => {
  it('crée une zone sans étagère avec un code Z', async () => {
    const zone = await createZone({ label: 'Pile ProDesk' });

    expect(zone.rack_code).toBe('Z01');
    expect(zone.is_zone).toBe(true);
    expect(zone.shelves_count).toBe(0);
    expect(zone.shelves).toHaveLength(0);
    expect(zone.items).toHaveLength(0);
  });

  it('numérote les zones indépendamment des rayonnages', async () => {
    await createRack();
    const zone = await createZone();
    expect(zone.rack_code).toBe('Z01');

    // R01 et Z01 coexistent sans conflit.
    const rows = (await api('/api/racks')).body;
    expect(rows.map((row) => row.rack_code).sort()).toEqual(['R01', 'Z01']);
  });

  it('ignore un nombre d’étagères demandé pour une zone', async () => {
    const zone = await createZone({ shelves_count: 4 });
    expect(zone.shelves_count).toBe(0);
  });

  it('refuse de transformer un rayonnage en zone', async () => {
    const rack = await createRack();
    const response = await api(`/api/racks/${rack.id}`, { method: 'PATCH', json: { kind: 'zone' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('supprimez-le');
  });
});

describe('PATCH /api/racks/:id', () => {
  it('ajoute les étagères manquantes quand le rayonnage grandit', async () => {
    const rack = await createRack({ shelves_count: 2 });
    const response = await api(`/api/racks/${rack.id}`, { method: 'PATCH', json: { shelves_count: 6 } });

    expect(response.status).toBe(200);
    expect(response.body.shelves).toHaveLength(6);
  });

  it('refuse de supprimer une étagère encore occupée', async () => {
    const rack = await createRack({ shelves_count: 3 });
    await api('/api/items', { method: 'POST', json: {
      user_id: context.userId,
      reference: 'ARB123',
      shelf_id: shelfIdOf(rack, 3),
    } });

    const response = await api(`/api/racks/${rack.id}`, { method: 'PATCH', json: { shelves_count: 2 } });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('R01-E3');
  });

  it('enregistre la position du rectangle sur la vue de dessus', async () => {
    const rack = await createRack();
    const response = await api(`/api/racks/${rack.id}`, { method: 'PATCH', json: { x: 42.5, y: 10, width: 20, height: 12 } });

    expect(response.status).toBe(200);
    expect(response.body.x).toBe(42.5);
    expect(response.body.y).toBe(10);
  });
});

describe('plan modulaire — angle libre, cotes et aspect', () => {
  it('pivote un meuble à n’importe quel angle, pas seulement au quart de tour', async () => {
    const rack = await createRack();
    const { status, body } = await api(`/api/racks/${rack.id}`, {
      method: 'PATCH',
      json: { angle: 37.5 },
    });

    expect(status).toBe(200);
    expect(body.angle).toBe(37.5);
  });

  it('ramène un angle qui dépasse le tour complet plutôt que de le refuser', async () => {
    const rack = await createRack();

    // Faire tourner la poignée deux fois ne doit pas lever d'erreur.
    const { body } = await api(`/api/racks/${rack.id}`, {
      method: 'PATCH',
      json: { angle: 450 },
    });
    expect(body.angle).toBe(90);

    const { body: negatif } = await api(`/api/racks/${rack.id}`, {
      method: 'PATCH',
      json: { angle: -90 },
    });
    expect(negatif.angle).toBe(270);
  });

  it('refuse un angle qui n’est pas un nombre', async () => {
    const rack = await createRack();
    const { status } = await api(`/api/racks/${rack.id}`, {
      method: 'PATCH',
      json: { angle: 'de biais' },
    });

    expect(status).toBe(400);
  });

  it('accepte des cotes saisies au clavier', async () => {
    const rack = await createRack();
    const { body } = await api(`/api/racks/${rack.id}`, {
      method: 'PATCH',
      json: { x: 12.5, y: 40, width: 33.25, height: 6 },
    });

    expect(body).toMatchObject({ x: 12.5, y: 40, width: 33.25, height: 6 });
  });

  it('pose une gondole : un rayonnage qui se dessine autrement', async () => {
    const { status, body } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: 1, label: 'Gondole centrale', style: 'gondola', shelves_count: 4 },
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({ style: 'gondola', kind: 'rack' });
    // Une gondole porte bien ses étagères : c'est un rayonnage.
    expect(body.shelves).toHaveLength(4);
  });

  it('refuse un aspect inconnu', async () => {
    const { status } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: 1, style: 'nuage' },
    });

    expect(status).toBe(400);
  });

  it('pivote aussi un repère : une porte est rarement d’équerre', async () => {
    const { body: porte } = await api('/api/landmarks', {
      method: 'POST',
      json: { site_id: 1, kind: 'door' },
    });
    expect(porte.angle).toBe(0);

    const { body } = await api(`/api/landmarks/${porte.id}`, {
      method: 'PATCH',
      json: { angle: 22 },
    });
    expect(body.angle).toBe(22);
  });
});

describe('DELETE /api/racks/:id', () => {
  it('supprime un rayonnage vide', async () => {
    const rack = await createRack();
    expect((await api(`/api/racks/${rack.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await api('/api/racks')).body).toHaveLength(0);
  });

  it('refuse de supprimer un rayonnage qui contient des articles', async () => {
    const rack = await createRack();
    await api('/api/items', { method: 'POST', json: { user_id: context.userId, reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) } });

    const response = await api(`/api/racks/${rack.id}`, { method: 'DELETE' });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('article');
  });

  it('refuse de supprimer une zone qui porte des articles', async () => {
    const zone = await createZone();
    await api('/api/items', { method: 'POST', json: { user_id: context.userId, reference: 'B39VLAT', zone_id: zone.id } });

    const response = await api(`/api/racks/${zone.id}`, { method: 'DELETE' });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('Z01');
  });
});
