/**
 * Codes d'emplacement.
 *
 * - Rayonnage : `R{rayon sur 2 chiffres}-E{étagère}` — ex. `R03-E2`.
 *   L'étagère 1 est celle du haut ; la vue de face les liste de haut en bas.
 * - Gondole (panneau perforé à broches) : `R{..}-B{rangée}` — ex. `R05-B3`.
 *   Même numérotation, de haut en bas ; seule la lettre change, parce qu'une
 *   broche n'est pas une tablette et qu'on ne range pas dessus de la même
 *   façon. C'est un rayonnage : il partage la numérotation des `R`.
 * - Zone (pile au sol, palette, cage, table…) : `Z{numéro sur 2 chiffres}`
 *   — ex. `Z01`. Une zone n'a pas d'étagère.
 *
 * Les codes sont toujours calculés depuis les entités, jamais saisis à la main.
 */

/** `3, 'rack'` → `R03` · `1, 'zone'` → `Z01` */
export function formatRackCode(code, kind = 'rack') {
  return `${kind === 'zone' ? 'Z' : 'R'}${String(code).padStart(2, '0')}`;
}

/** Une gondole porte des rangées de broches, pas des tablettes. */
export const isPegboard = (style) => style === 'pegboard';

/** `2` → `E2`, ou `B2` sur une gondole (code court d'une bande) */
export function formatShelfShortCode(shelfIndex, style = '') {
  return `${isPegboard(style) ? 'B' : 'E'}${shelfIndex}`;
}

/** `3, 2` → `R03-E2` · `5, 3, 'pegboard'` → `R05-B3` */
export function formatShelfCode(rackCode, shelfIndex, style = '') {
  return `${formatRackCode(rackCode, 'rack')}-${formatShelfShortCode(shelfIndex, style)}`;
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

  const shelf = /^R(\d{1,2})-([EB])(\d{1,2})$/.exec(trimmed);
  if (shelf) {
    return { kind: 'rack', rackCode: Number(shelf[1]), shelfIndex: Number(shelf[3]) };
  }

  const zone = /^Z(\d{1,2})$/.exec(trimmed);
  if (zone) {
    return { kind: 'zone', rackCode: Number(zone[1]), shelfIndex: null };
  }

  return null;
}
