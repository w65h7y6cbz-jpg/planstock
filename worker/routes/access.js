import { Hono } from 'hono';
import { COOKIE, COOKIE_MAX_AGE, accessStatus, sameSecret } from '../lib/access.js';
import { badRequest, body } from '../lib/http.js';

/**
 * Ouverture de la porte. Seul point d'entrée joignable sans être déjà autorisé.
 */
export const access = new Hono();

access.get('/', (c) => {
  const status = accessStatus(c);
  return c.json({
    open: status.open,
    can_use_code: status.canUseCode ?? Boolean(c.env.PLANSTOCK_ACCESS_CODE),
    // L'adresse vue par Cloudflare : c'est celle à recopier dans les réglages
    // pour autoriser le magasin.
    your_ip: c.req.header('cf-connecting-ip') ?? '',
  });
});

access.post('/', async (c) => {
  const expected = c.env.PLANSTOCK_ACCESS_CODE ?? '';
  if (!expected) throw badRequest('Aucun code d’accès n’est configuré sur cette installation.');

  const submitted = String((await body(c)).code ?? '');
  if (!sameSecret(submitted, expected)) throw badRequest('Code incorrect.');

  c.header(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(expected)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  );
  return c.json({ open: true });
});
