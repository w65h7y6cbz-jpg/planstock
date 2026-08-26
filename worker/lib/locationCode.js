/**
 * Codes d'emplacement.
 *
 * - Rayonnage : `R{rayon sur 2 chiffres}-E{étagère}` — ex. `R03-E2`.
 *   L'étagère 1 est celle du haut ; la vue de face les liste de haut en bas.
 * - Zone (pile au sol, palette, cage, table…) : `Z{numéro sur 2 chiffres}`
 *   — ex. `Z01`. Une zone n'a pas d'étagère.
 *
 * Les codes sont toujours calculés depuis les entités, jamais saisis à la main.
 */

/** `3, 'rack'` → `R03` · `1, 'zone'` → `Z01` */
export function formatRackCode(code, kind = 'rack') {
  return `${kind === 'zone' ? 'Z' : 'R'}${String(code).padStart(2, '0')}`;
}

/** `2` → `E2` (code court affiché sur une bande d'étagère) */
export function formatShelfShortCode(shelfIndex) {
  return `E${shelfIndex}`;
}

/** `3, 2` → `R03-E2` */
export function formatShelfCode(rackCode, shelfIndex) {
  return `${formatRackCode(rackCode, 'rack')}-${formatShelfShortCode(shelfIndex)}`;
}

/** `2` → `Z02` */
export function formatZoneCode(zoneCode) {
  return formatRackCode(zoneCode, 'zone');
}

/**
 * `R03-E2` → `{ kind: 'rack', rackCode: 3, shelfIndex: 2 }`
 * `Z02`    → `{ kind: 'zone', rackCode: 2, shelfIndex: null }`
 * sinon `null`.
 */
export function parseLocationCode(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toUpperCase();

  const shelf = /^R(\d{1,2})-E(\d{1,2})$/.exec(trimmed);
  if (shelf) {
    return { kind: 'rack', rackCode: Number(shelf[1]), shelfIndex: Number(shelf[2]) };
  }

  const zone = /^Z(\d{1,2})$/.exec(trimmed);
  if (zone) {
    return { kind: 'zone', rackCode: Number(zone[1]), shelfIndex: null };
  }

  return null;
}
