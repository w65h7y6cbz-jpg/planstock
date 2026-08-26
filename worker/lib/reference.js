/**
 * Normalisation des références article.
 *
 * Une référence saisie par un technicien peut contenir des espaces, des tirets,
 * des slashs ou des points selon la façon dont elle est lue sur le bon papier.
 * La forme normalisée (majuscules, sans ces séparateurs) sert à la fois de clé
 * d'unicité en base et de clé de recherche.
 *
 *   `uk707e/l`  → `UK707EL`
 *   `ar-b 123`  → `ARB123`
 */

const SEPARATEURS = /[\s\-\/.]/g;

export function normalizeReference(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).toUpperCase().replace(SEPARATEURS, '');
}

/** Référence normalisée non vide, sinon `null`. */
export function normalizeReferenceStrict(raw) {
  const normalized = normalizeReference(raw);
  return normalized.length > 0 ? normalized : null;
}

/** Nettoie la référence telle qu'elle sera réaffichée (espaces de bord retirés). */
export function cleanDisplayReference(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim();
}
