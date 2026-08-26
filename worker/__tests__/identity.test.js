import { beforeEach, describe, expect, it } from 'vitest';
import { actAs, anonymousApi, api, createContext, createRack, shelfIdOf } from './helpers.js';

/**
 * Code à 4 chiffres et permissions.
 *
 * Deux choses se jouent ici. D'abord qu'un code à 4 chiffres tienne malgré ses
 * 10 000 combinaisons — c'est le blocage qui fait le travail, pas le hachage.
 * Ensuite que déployer cette version ne mette personne dehors : un prénom sans
 * code continue de fonctionner comme avant.
 */

let context;

beforeEach(async () => {
  context = await createContext();
});

const setPin = (userId, pin, extra = {}) =>
  api(`/api/session/pin/${userId}`, { method: 'PUT', json: { pin, ...extra } });

const addUser = (firstName) =>
  api('/api/users', { method: 'POST', json: { first_name: firstName } });

const postItem = (payload) =>
  api('/api/items', { method: 'POST', json: { user_id: context.userId, ...payload } });

describe('un prénom sans code marche comme avant', () => {
  it('laisse créer un rayonnage en s’annonçant simplement', async () => {
    const { status } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: context.siteId, label: 'Sans code' },
    });
    expect(status).toBe(201);
  });

  it('signale qu’il n’a pas encore de code', async () => {
    const { body } = await api('/api/users');
    expect(body.find((user) => user.id === context.userId).has_pin).toBe(false);
  });

  it('refuse toujours un inconnu qui ne s’annonce pas', async () => {
    const { status } = await anonymousApi('/api/racks', {
      method: 'POST',
      json: { site_id: context.siteId },
    });
    expect(status).toBe(400);
  });
});

describe('choisir un code', () => {
  it('accepte quatre chiffres et rien d’autre', async () => {
    expect((await setPin(context.userId, '1234')).status).toBe(200);
  });

  it('refuse un code trop court, trop long, ou avec des lettres', async () => {
    for (const mauvais of ['123', '12345', '12a4', '']) {
      const { status } = await setPin(context.userId, mauvais);
      expect(status).toBe(400);
    }
  });

  it('ne renvoie jamais le code ni son empreinte', async () => {
    await setPin(context.userId, '1234');
    const { body, text } = await api('/api/users');

    expect(text).not.toContain('1234');
    expect(body[0].pin_hash).toBeUndefined();
    expect(body[0].pin_salt).toBeUndefined();
  });

  it('exige l’ancien code pour en changer', async () => {
    await setPin(context.userId, '1234');

    const sansAncien = await setPin(context.userId, '9999');
    expect(sansAncien.status).toBe(400);

    const mauvaisAncien = await setPin(context.userId, '9999', { current_pin: '0000' });
    expect(mauvaisAncien.status).toBe(403);

    const bonAncien = await setPin(context.userId, '9999', { current_pin: '1234' });
    expect(bonAncien.status).toBe(200);
  });
});

describe('ouvrir une session avec son code', () => {
  it('ouvre avec le bon code et pose un cookie', async () => {
    await setPin(context.userId, '1234');
    const { status, headers } = await api('/api/session', {
      method: 'POST',
      json: { user_id: context.userId, pin: '1234' },
    });

    expect(status).toBe(200);
    expect(headers.get('set-cookie')).toMatch(/planstock_user=/);
    // Le cookie ne doit pas être lisible par du script, ni voyager en clair.
    expect(headers.get('set-cookie')).toMatch(/HttpOnly/);
  });

  it('refuse un mauvais code', async () => {
    await setPin(context.userId, '1234');
    const { status, body } = await api('/api/session', {
      method: 'POST',
      json: { user_id: context.userId, pin: '0000' },
    });

    expect(status).toBe(403);
    expect(body.error).toMatch(/incorrect/i);
  });

  it('bloque le prénom après cinq essais ratés', async () => {
    await setPin(context.userId, '1234');

    for (let essai = 0; essai < 4; essai += 1) {
      const { status } = await api('/api/session', {
        method: 'POST',
        json: { user_id: context.userId, pin: '0000' },
      });
      expect(status).toBe(403);
    }

    const cinquieme = await api('/api/session', {
      method: 'POST',
      json: { user_id: context.userId, pin: '0000' },
    });
    expect(cinquieme.body.error).toMatch(/bloqué/);

    // Et le bon code ne rouvre pas la porte tant que le blocage court : sinon
    // il suffirait de tomber juste au sixième essai.
    const avecLeBon = await api('/api/session', {
      method: 'POST',
      json: { user_id: context.userId, pin: '1234' },
    });
    expect(avecLeBon.status).toBe(403);
    expect(avecLeBon.body.error).toMatch(/bloqué/);
  });

  it('remet le compteur à zéro dès qu’un code juste passe', async () => {
    await setPin(context.userId, '1234');

    for (let essai = 0; essai < 3; essai += 1) {
      await api('/api/session', {
        method: 'POST',
        json: { user_id: context.userId, pin: '0000' },
      });
    }
    await api('/api/session', { method: 'POST', json: { user_id: context.userId, pin: '1234' } });

    // Trois nouveaux ratés ne doivent pas bloquer : l'ardoise était effacée.
    for (let essai = 0; essai < 3; essai += 1) {
      const { body } = await api('/api/session', {
        method: 'POST',
        json: { user_id: context.userId, pin: '0000' },
      });
      expect(body.error).toMatch(/incorrect/i);
    }
  });
});

describe('un prénom protégé ne se prête plus', () => {
  it('refuse une écriture faite en son nom sans son code', async () => {
    await setPin(context.userId, '1234');

    // On s'annonce comme lui, mais sans session : c'est précisément ce que le
    // code doit empêcher.
    const { status, body } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: context.siteId, label: 'Usurpation' },
    });

    expect(status).toBe(403);
    expect(body.error).toMatch(/code/i);
  });
});

describe('la sauvegarde ne transporte pas les codes', () => {
  it('retire les empreintes du fichier téléchargé', async () => {
    await setPin(context.userId, '1234');
    const { text, body } = await api('/api/backups/export');

    // Une empreinte de code à 4 chiffres se casse hors ligne en quelques
    // secondes : elle n'a rien à faire dans un fichier qui circule.
    expect(text).not.toContain('pin_hash');
    expect(text).not.toContain('pin_salt');
    expect(body.tables.users[0].pin_hash).toBeUndefined();
    // Les droits, eux, sont bien sauvegardés.
    expect(body.tables.users[0].can_admin).toBeDefined();
  });
});

describe('permissions', () => {
  it('empêche de déplacer un article sans le droit', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: item } = await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });

    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, { method: 'PATCH', json: { can_move: false } });

    actAs(marc.id);
    const { status, body } = await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { shelf_id: shelfIdOf(rack, 2) },
    });
    actAs(context.userId);

    expect(status).toBe(403);
    expect(body.error).toMatch(/déplacer/);
  });

  it('empêche de supprimer un article sans le droit', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: item } = await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });

    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, { method: 'PATCH', json: { can_delete: false } });

    actAs(marc.id);
    const { status } = await api(`/api/items/${item.id}`, { method: 'DELETE' });
    actAs(context.userId);

    expect(status).toBe(403);
  });

  it('empêche de toucher au plan sans le droit', async () => {
    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, { method: 'PATCH', json: { can_admin: false } });

    actAs(marc.id);
    const { status, body } = await api('/api/racks', {
      method: 'POST',
      json: { site_id: context.siteId, label: 'Interdit' },
    });
    actAs(context.userId);

    expect(status).toBe(403);
    expect(body.error).toMatch(/plan et les réglages/);
  });

  it('laisse chercher et lire même sans aucun droit', async () => {
    const rack = await createRack({ site_id: context.siteId });
    await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });

    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, {
      method: 'PATCH',
      json: { can_move: false, can_delete: false, can_admin: false },
    });

    actAs(marc.id);
    const recherche = await api(`/api/items/search?q=ARB123&site_id=${context.siteId}`);
    const plan = await api(`/api/racks?site_id=${context.siteId}`);
    actAs(context.userId);

    expect(recherche.status).toBe(200);
    expect(recherche.body.exact.reference).toBe('ARB123');
    expect(plan.status).toBe(200);
  });

  it('ferme un stock à part aux prénoms qui n’y ont pas accès', async () => {
    const rack = await createRack({ site_id: context.siteId });
    const { body: aocci } = await api('/api/customers', {
      method: 'POST',
      json: { site_id: context.siteId, name: 'AOCCI' },
    });
    const { body: item } = await postItem({ reference: 'ARB123', shelf_id: shelfIdOf(rack, 1) });
    await api(`/api/items/${item.id}/location`, {
      method: 'PUT',
      json: { shelf_id: shelfIdOf(rack, 2), customer_id: aocci.id },
    });

    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, {
      method: 'PATCH',
      json: { restrict_customers: true, customer_ids: [] },
    });

    actAs(marc.id);
    const refuse = await api(
      `/api/items/search?q=ARB123&site_id=${context.siteId}&customer_id=${aocci.id}`,
    );
    // Le stock général, lui, reste ouvert à tout le monde.
    const general = await api(`/api/items/search?q=ARB123&site_id=${context.siteId}`);
    actAs(context.userId);

    expect(refuse.status).toBe(403);
    expect(refuse.body.error).toMatch(/AOCCI/);
    expect(general.status).toBe(200);
  });

  it('laisse entrer dans un stock qu’on lui a confié', async () => {
    const { body: aocci } = await api('/api/customers', {
      method: 'POST',
      json: { site_id: context.siteId, name: 'AOCCI' },
    });
    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, {
      method: 'PATCH',
      json: { restrict_customers: true, customer_ids: [aocci.id] },
    });

    actAs(marc.id);
    const { status } = await api(
      `/api/items/search?q=ARB123&site_id=${context.siteId}&customer_id=${aocci.id}`,
    );
    actAs(context.userId);

    expect(status).toBe(200);
  });

  it('démarre tout permis : un prénom ajouté peut travailler tout de suite', async () => {
    const { body: marc } = await addUser('Marc');
    expect(marc).toMatchObject({ can_move: true, can_delete: true, can_admin: true });
    expect(marc.customer_ids).toEqual([]);
  });

  it('dit dans la liste des prénoms quels stocks sont confiés à chacun', async () => {
    const { body: aocci } = await api('/api/customers', {
      method: 'POST',
      json: { site_id: context.siteId, name: 'AOCCI' },
    });
    const { body: marc } = await addUser('Marc');
    await api(`/api/users/${marc.id}`, {
      method: 'PATCH',
      json: { restrict_customers: true, customer_ids: [aocci.id] },
    });

    // L'écran Équipe coche les stocks depuis cette liste : sans ce champ, il
    // afficherait toutes les cases vides alors que les droits sont posés.
    const { body: liste } = await api('/api/users?all=1');
    const ligne = liste.find((row) => row.id === marc.id);
    expect(ligne.restrict_customers).toBe(true);
    expect(ligne.customer_ids).toEqual([aocci.id]);

    const autre = liste.find((row) => row.id === context.userId);
    expect(autre.customer_ids).toEqual([]);
  });

  it('remplace en bloc les stocks confiés : décocher retire vraiment', async () => {
    const { body: aocci } = await api('/api/customers', {
      method: 'POST',
      json: { site_id: context.siteId, name: 'AOCCI' },
    });
    const { body: mairie } = await api('/api/customers', {
      method: 'POST',
      json: { site_id: context.siteId, name: 'Mairie' },
    });
    const { body: marc } = await addUser('Marc');

    await api(`/api/users/${marc.id}`, {
      method: 'PATCH',
      json: { restrict_customers: true, customer_ids: [aocci.id, mairie.id] },
    });
    const { body: retire } = await api(`/api/users/${marc.id}`, {
      method: 'PATCH',
      json: { customer_ids: [mairie.id] },
    });

    expect(retire.customer_ids).toEqual([mairie.id]);

    actAs(marc.id);
    const ferme = await api(
      `/api/items/search?q=ARB123&site_id=${context.siteId}&customer_id=${aocci.id}`,
    );
    actAs(context.userId);
    expect(ferme.status).toBe(403);
  });
});
