/**
 * Codes d'emplacement `R{rayon}-E{étagère}-C{case}`.
 *
 * Exemple : `R03-E2-C4` = rayonnage 3, étagère 2 (1 = étagère du bas),
 * case 4 (1 = case de gauche vue de face).
 *
 * Le code est toujours calculé depuis les entités (rack / shelf_index /
 * slot_index) et n'est jamais saisi à la main.
 */

/** `3` → `R03` */
export function formatRackCode(rackCode) {
  return `R${String(rackCode).padStart(2, '0')}`;
}

/** `2, 4` → `E2-C4` (code court affiché dans une case du plan) */
export function formatSlotShortCode(shelfIndex, slotIndex) {
  return `E${shelfIndex}-C${slotIndex}`;
}

/** `3, 2, 4` → `R03-E2-C4` */
export function formatLocationCode(rackCode, shelfIndex, slotIndex) {
  return `${formatRackCode(rackCode)}-${formatSlotShortCode(shelfIndex, slotIndex)}`;
}

/** `R03-E2-C4` → `{ rackCode: 3, shelfIndex: 2, slotIndex: 4 }`, sinon `null`. */
export function parseLocationCode(code) {
  if (typeof code !== 'string') return null;
  const match = /^R(\d{1,2})-E(\d{1,2})-C(\d{1,2})$/.exec(code.trim().toUpperCase());
  if (!match) return null;
  return {
    rackCode: Number(match[1]),
    shelfIndex: Number(match[2]),
    slotIndex: Number(match[3]),
  };
}
