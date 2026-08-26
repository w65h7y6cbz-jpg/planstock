import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { api } from './helpers.js';

/**
 * PlanStock n'a jamais eu de mot de passe. En ligne, il lui faut quand même une
 * porte : l'IP du magasin, et un code partagé en secours si cette IP change.
 */

const IP = '203.0.113.5';
const AUTRE_IP = '198.51.100.9';

afterEach(() => {
  delete env.PLANSTOCK_ALLOWED_IPS;
  delete env.PLANSTOCK_ACCESS_CODE;
});

const fromIp = (ip) => ({ headers: { 'CF-Connecting-IP': ip } });

describe('contrôle d’accès', () => {
  it('laisse tout passer tant que rien n’est configuré', async () => {
    expect((await api('/api/health', fromIp(AUTRE_IP))).status).toBe(200);
    expect((await api('/api/access')).body.open).toBe(true);
  });

  it('n’ouvre qu’aux adresses du magasin', async () => {
    env.PLANSTOCK_ALLOWED_IPS = IP;

    expect((await api('/api/health', fromIp(IP))).status).toBe(200);

    const refusé = await api('/api/health', fromIp(AUTRE_IP));
    expect(refusé.status).toBe(403);
    expect(refusé.body.error).toContain('adresses autorisées');
  });

  it('accepte plusieurs adresses séparées par des virgules', async () => {
    env.PLANSTOCK_ALLOWED_IPS = ` ${IP} , ${AUTRE_IP} `;
    expect((await api('/api/health', fromIp(AUTRE_IP))).status).toBe(200);
  });

  it('renvoie l’adresse vue par Cloudflare, à recopier dans les réglages', async () => {
    env.PLANSTOCK_ALLOWED_IPS = IP;
    const { body } = await api('/api/access', fromIp(AUTRE_IP));
    expect(body).toMatchObject({ open: false, your_ip: AUTRE_IP });
  });

  it('ouvre avec le code de secours quand l’IP a changé', async () => {
    env.PLANSTOCK_ALLOWED_IPS = IP;
    env.PLANSTOCK_ACCESS_CODE = 'atelier-2026';

    const refusé = await api('/api/health', fromIp(AUTRE_IP));
    expect(refusé.status).toBe(403);
    expect(refusé.body.details.canUseCode).toBe(true);

    const mauvais = await api('/api/access', {
      method: 'POST',
      json: { code: 'atelier-2025' },
      ...fromIp(AUTRE_IP),
    });
    expect(mauvais.status).toBe(400);
    expect(mauvais.body.error).toBe('Code incorrect.');

    const bon = await api('/api/access', {
      method: 'POST',
      json: { code: 'atelier-2026' },
      ...fromIp(AUTRE_IP),
    });
    expect(bon.status).toBe(200);

    // Le navigateur garde le témoin : la connexion reste ouverte ensuite.
    const cookie = bon.headers.get('set-cookie');
    expect(cookie).toContain('planstock_access=');
    expect(cookie).toContain('HttpOnly');

    const après = await api('/api/health', {
      headers: { 'CF-Connecting-IP': AUTRE_IP, Cookie: cookie.split(';')[0] },
    });
    expect(après.status).toBe(200);
  });

  it('refuse de valider un code quand aucun n’est configuré', async () => {
    env.PLANSTOCK_ALLOWED_IPS = IP;
    const response = await api('/api/access', {
      method: 'POST',
      json: { code: 'peu importe' },
      ...fromIp(AUTRE_IP),
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Aucun code');
  });

  it('laisse toujours joindre l’écran d’entrée, même refusé', async () => {
    env.PLANSTOCK_ALLOWED_IPS = IP;
    expect((await api('/api/access', fromIp(AUTRE_IP))).status).toBe(200);
  });
});
