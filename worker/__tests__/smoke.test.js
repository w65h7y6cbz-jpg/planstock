import { describe, expect, it } from 'vitest';
import { api, createContext, createRack, shelfIdOf } from './helpers.js';

describe('mise en place', () => {
  it('sert la santé et les deux locaux sur une base neuve', async () => {
    const health = await api('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true, empty: true });
    expect(health.body.counts.sites).toBe(2);

    const sites = await api('/api/sites');
    expect(sites.body.map((site) => site.name)).toEqual(['Optimium', 'Sharp Center']);
  });

  it('crée un rayonnage, y range un article et le retrouve', async () => {
    const context = await createContext();
    const rack = await createRack({ site_id: context.siteId, label: 'Rayon consommables' });
    expect(rack.rack_code).toBe('R01');
    expect(rack.shelves).toHaveLength(3);

    const created = await api('/api/items', {
      method: 'POST',
      json: {
        user_id: context.userId,
        reference: 'UK707E/L',
        designation: 'Toner noir',
        shelf_id: shelfIdOf(rack, 1),
        side: 'left',
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.locations[0]).toMatchObject({ code: 'R01-E1', side: 'left' });

    const found = await api(`/api/items/search?q=uk-707-e-l&site_id=${context.siteId}`);
    expect(found.body.exact.reference_display).toBe('UK707E/L');

    const movements = await api('/api/movements?reference=UK707EL');
    expect(movements.body.map((m) => m.action)).toEqual(['create']);
    expect(movements.body[0].to_code).toBe('R01-E1');
  });
});
