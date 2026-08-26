import { forbidden } from './http.js';

/**
 * Contrôle d'accès.
 *
 * PlanStock n'a jamais eu de compte ni de mot de passe : le prénom dans une
 * liste sert à tracer qui range quoi, pas à ouvrir la porte. Tant que
 * l'application vivait sur le PC du SAV, la porte était le bâtiment.
 *
 * En ligne, il en faut une. Deux verrous, et le second sauve du premier :
 *
 * 1. `PLANSTOCK_ALLOWED_IPS` — les adresses IP publiques autorisées, séparées
 *    par des virgules. C'est le filtre voulu : « accessible seulement depuis le
 *    magasin ».
 * 2. `PLANSTOCK_ACCESS_CODE` — un code partagé, saisi une fois par navigateur.
 *    Il existe parce qu'une IP de PME change souvent sans prévenir : sans lui,
 *    un changement d'adresse mettrait tout le monde dehors, sans recours.
 *
 * Les deux réglages sont facultatifs. S'ils sont absents tous les deux, l'accès
 * est libre — c'est l'état du premier déploiement, à ne pas laisser durer.
 */

const COOKIE = 'planstock_access';
/** Un mois : le poste du magasin ne redemande pas le code chaque matin. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function allowedIps(env) {
  return String(env.PLANSTOCK_ALLOWED_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/** Comparaison à durée constante : un code ne se devine pas caractère par caractère. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function hasValidCookie(c, code) {
  const header = c.req.header('cookie') ?? '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`));
  return match ? sameSecret(decodeURIComponent(match[1]), code) : false;
}

/** Décrit l'état du contrôle d'accès, pour l'écran d'entrée. */
export function accessStatus(c) {
  const { env } = c;
  const ips = allowedIps(env);
  const code = env.PLANSTOCK_ACCESS_CODE ?? '';

  if (ips.length === 0 && !code) return { open: true, reason: 'unconfigured' };

  const clientIp = c.req.header('cf-connecting-ip') ?? '';
  if (ips.length > 0 && ips.includes(clientIp)) return { open: true, reason: 'ip' };
  if (code && hasValidCookie(c, code)) return { open: true, reason: 'code' };

  return {
    open: false,
    // Sans code configuré, il n'y a rien à saisir : l'écran le dira.
    canUseCode: Boolean(code),
    ip: clientIp,
  };
}

/**
 * Barrière posée devant l'API. `/api/access/*` reste ouvert : c'est par là
 * qu'on saisit le code et qu'on demande son état.
 */
export function accessGuard(c, next) {
  if (c.req.path.startsWith('/api/access')) return next();

  const status = accessStatus(c);
  if (status.open) return next();

  throw forbidden(
    status.canUseCode
      ? 'Accès refusé depuis cette connexion. Saisissez le code d’accès.'
      : 'Accès refusé depuis cette connexion : elle ne fait pas partie des adresses autorisées.',
    { ip: status.ip, canUseCode: status.canUseCode },
  );
}

export { COOKIE, COOKIE_MAX_AGE, sameSecret };
