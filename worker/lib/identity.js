import { badRequest, forbidden } from './http.js';

/**
 * Identité d'un technicien : son code à 4 chiffres, et la session qui en découle.
 *
 * Le prénom était une étiquette qu'on choisissait dans une liste. Il devient une
 * identité. Trois choses gouvernent ce fichier :
 *
 * 1. **Un code à 4 chiffres, c'est 10 000 combinaisons.** Le hachage seul ne
 *    protège rien face à un espace aussi petit : c'est le blocage après quelques
 *    essais ratés qui fait le vrai travail. Le hachage empêche seulement qu'une
 *    fuite de la base livre les codes en clair — et comme les gens réutilisent
 *    leurs codes ailleurs, ça compte.
 *
 * 2. **Personne ne doit se retrouver dehors de son propre outil.** Un prénom
 *    sans code fonctionne comme avant. C'est un trou, assumé et temporaire : il
 *    se referme prénom par prénom, à mesure que les codes sont posés.
 *
 * 3. **Le temps de vérification ne doit rien dire.** Un prénom inconnu coûte
 *    autant qu'un mauvais code, et la comparaison des empreintes se fait à
 *    durée constante.
 */

const PIN_LENGTH = 4;
const ITERATIONS = 100_000;
/** Cinq essais, puis un quart d'heure de silence. */
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'planstock_user';

const encoder = new TextEncoder();

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

/** Le code est fait de chiffres, et de rien d'autre. */
export function readPin(value) {
  const pin = String(value ?? '').trim();
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw badRequest(`Le code doit être composé de ${PIN_LENGTH} chiffres.`);
  }
  return pin;
}

export async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

/** Empreinte fraîche pour un code qu'on vient de choisir. */
export async function newPinRecord(pin) {
  const salt = randomHex(16);
  return { pin_salt: salt, pin_hash: await hashPin(pin, salt) };
}

/**
 * Comparaison à durée constante. Un `===` sur des chaînes s'arrête au premier
 * caractère différent : le temps de réponse trahirait alors le début de
 * l'empreinte attendue.
 */
function sameDigest(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export const hasPin = (user) => Boolean(user?.pin_hash);

/** Minutes restantes avant qu'un compte bloqué se rouvre, ou 0. */
export function lockRemaining(user, now = new Date()) {
  if (!user?.locked_until) return 0;
  const until = new Date(user.locked_until);
  if (Number.isNaN(until.getTime()) || until <= now) return 0;
  return Math.ceil((until.getTime() - now.getTime()) / 60_000);
}

/**
 * Vérifie un code et met à jour le compteur d'essais. Renvoie l'utilisateur si
 * le code est bon, lève sinon — sans jamais dire si le prénom existe.
 */
export async function verifyPin(db, user, pin) {
  const blocked = lockRemaining(user);
  if (blocked > 0) {
    throw forbidden(
      `Trop d’essais. Ce prénom est bloqué encore ${blocked} minute${blocked > 1 ? 's' : ''}.`,
    );
  }

  const candidate = await hashPin(pin, user.pin_salt);
  if (sameDigest(candidate, user.pin_hash)) {
    // Un code juste efface l'ardoise : le compteur ne doit pas s'accumuler sur
    // des semaines de fautes de frappe isolées.
    if (user.failed_attempts > 0 || user.locked_until) {
      await db.run(
        "UPDATE users SET failed_attempts = 0, locked_until = '' WHERE id = ?",
        user.id,
      );
    }
    return user;
  }

  const attempts = (user.failed_attempts ?? 0) + 1;
  const lockedUntil =
    attempts >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
      : '';
  await db.run(
    'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
    attempts >= MAX_ATTEMPTS ? 0 : attempts,
    lockedUntil,
    user.id,
  );

  if (lockedUntil) {
    throw forbidden(`Trop d’essais. Ce prénom est bloqué ${LOCK_MINUTES} minutes.`);
  }
  throw forbidden('Code incorrect.');
}

/* ---- Session signée -------------------------------------------------------- */

/**
 * Secret de signature, tiré au sort à la première demande et rangé en base.
 * Il survit aux redéploiements sans que personne ait à le poser à la main.
 */
async function sessionSecret(db) {
  const row = await db.get("SELECT value FROM app_secrets WHERE key = 'session_secret'");
  if (row?.value) return row.value;

  const secret = randomHex(32);
  // `DO NOTHING` puis relecture : deux requêtes simultanées sur une base neuve
  // en tireraient deux, et le perdant invaliderait les sessions du gagnant.
  await db.run(
    "INSERT INTO app_secrets (key, value) VALUES ('session_secret', ?) ON CONFLICT(key) DO NOTHING",
    secret,
  );
  const stored = await db.get("SELECT value FROM app_secrets WHERE key = 'session_secret'");
  return stored?.value ?? secret;
}

async function sign(db, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(await sessionSecret(db)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

/** Jeton `id.expiration.signature` : lisible, mais infalsifiable sans le secret. */
export async function issueSession(db, userId) {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${await sign(db, payload)}`;
}

/** Identifiant porté par un jeton valide, ou `null`. */
export async function readSession(db, token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;

  const [rawId, rawExpires, signature] = parts;
  const payload = `${rawId}.${rawExpires}`;
  const expected = await sign(db, payload);
  if (!sameDigest(signature, expected)) return null;

  if (!Number(rawExpires) || Number(rawExpires) < Date.now()) return null;
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export const clearedSessionCookie = () =>
  `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
