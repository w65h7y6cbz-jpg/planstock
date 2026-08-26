/**
 * Normalisation des références, côté front.
 *
 * Même règle que le serveur (`server/lib/reference.js`) : majuscules, sans
 * espaces, tirets, slashs ni points. Dupliquée volontairement plutôt que
 * partagée dans un paquet commun, pour garder le build trivial ; les deux
 * implémentations sont couvertes par des tests identiques.
 */

const SEPARATEURS = /[\s\-/.]/g;

export function normalizeReference(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).toUpperCase().replace(SEPARATEURS, '');
}

/** Nombre minimal de caractères avant de proposer des suggestions. */
export const PREFIX_MIN_LENGTH = 3;

/** Une référence est exploitable dès qu'elle contient au moins un caractère utile. */
export function isSearchable(raw: string | null | undefined): boolean {
  return normalizeReference(raw).length > 0;
}
