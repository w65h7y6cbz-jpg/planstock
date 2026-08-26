import { beforeEach, describe, expect, it } from 'vitest';
import { api, createContext, createRack, shelfIdOf, anonymousApi } from './helpers.js';

let context;

beforeEach(async () => {
  context = await createContext();
});

describe('jeu de démonstration', () => {
  it('installe les deux locaux sur une base sans stock', async () => {
    expect((await api('/api/demo')).body.available).toBe(true);

    const response = await api('/api/demo', {
      method: 'POST',
      json: { user_id: context.userId },
    });
    expect(response.status).toBe(201);
    // Quatre rayonnages à Optimium, deux à Sharp Center.
    expect(response.body.racks).toBe(6);
    expect(response.body.zones).toBe(4);
    expect(response.body.items).toBeGreaterThan(25);

    const search = await api(`/api/items/search?q=uk707el&site_id=${context.siteId}`);
    expect(search.body.exact.reference_display).toBe('UK707E/L');
    expect(search.body.exact.locations[0]).toMatchObject({
      code: 'R03-E1',
      site_name: 'Optimium',
      side: 'left',
    });

    // Chaque local a ses propres numéros, et son propre stock.
    const sites = await api('/api/sites');
    expect(sites.body[0]).toMatchObject({ racks_count: 4, zones_count: 3 });
    expect(sites.body[1]).toMatchObject({ racks_count: 2, zones_count: 1 });

    // La porte et l'établi sont posés sur le plan d'Optimium.
    const landmarks = await api(`/api/landmarks?site_id=${context.siteId}`);
    expect(landmarks.body.map((row) => row.kind).sort()).toEqual(['bench', 'door']);

    // Chaque article créé laisse une trace.
    const movements = await api('/api/movements');
    expect(movements.body).toHaveLength(response.body.items);
    expect(movements.body[0].user_first_name).toBe('Daniel');
  });

  it('refuse de s’installer si la base contient déjà du stock', async () => {
    await createRack({ site_id: context.siteId });
    expect((await api('/api/demo')).body.available).toBe(false);

    const response = await api('/api/demo', {
      method: 'POST',
      json: { user_id: context.userId },
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('sans rayonnage');
  });
});

describe('sauvegardes', () => {
  it('compte ce que pèse la base', async () => {
    const rack = await createRack({ site_id: context.siteId });
    await api('/api/items', {
      method: 'POST',
      json: { user_id: context.userId, reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) },
    });

    const { body } = await api('/api/backups');
    // Trois locaux : les deux vrais, plus celui de démonstration. Ces compteurs
    // disent ce que pèse la sauvegarde, pas ce que l'écran de choix montre — et
    // le local de démonstration doit bien y figurer, sinon une restauration le
    // ferait disparaître et l'adresse `?demo` tomberait dans le vide.
    expect(body.counts).toMatchObject({ sites: 3, users: 1, racks: 1, items: 1 });
  });

  it('exporte un fichier complet, puis le restaure à l’identique', async () => {
    const rack = await createRack({ site_id: context.siteId, label: 'Rayon consommables' });
    await api('/api/items', {
      method: 'POST',
      json: {
        user_id: context.userId,
        reference: 'UK707E/L',
        designation: 'Toner noir',
        shelf_id: shelfIdOf(rack, 2),
        side: 'right',
      },
    });

    const exported = await api('/api/backups/export');
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-disposition')).toContain('planstock-');
    const backup = JSON.parse(exported.text);
    expect(backup.format).toBe('planstock-backup-1');
    expect(backup.tables.items).toHaveLength(1);

    // On casse tout : article supprimé, rayonnage renommé.
    const items = await api('/api/items');
    await api(`/api/items/${items.body[0].id}`, {
      method: 'DELETE',
      json: { user_id: context.userId },
    });
    await api(`/api/racks/${rack.id}`, { method: 'PATCH', json: { label: 'Perdu' } });
    expect((await api('/api/items')).body).toHaveLength(0);

    const restored = await api('/api/backups/restore', {
      method: 'POST',
      json: { user_id: context.userId, backup },
    });
    expect(restored.status).toBe(200);
    expect(restored.body.counts).toMatchObject({ items: 1, racks: 1, sites: 3 });

    const après = await api(`/api/items/search?q=UK707EL&site_id=${context.siteId}`);
    expect(après.body.exact.designation).toBe('Toner noir');
    expect(après.body.exact.locations[0]).toMatchObject({ code: 'R01-E2', side: 'right' });
    expect((await api(`/api/racks/${rack.id}`)).body.label).toBe('Rayon consommables');
  });

  it('refuse un fichier qui n’est pas une sauvegarde PlanStock', async () => {
    const response = await api('/api/backups/restore', {
      method: 'POST',
      json: { user_id: context.userId, backup: { format: 'autre-chose', tables: {} } },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('sauvegarde PlanStock');
  });

  it('exige un prénom avant de restaurer', async () => {
    const response = await anonymousApi('/api/backups/restore', {
      method: 'POST',
      json: { backup: { format: 'planstock-backup-1', tables: {} } },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('prénom');
  });
});
