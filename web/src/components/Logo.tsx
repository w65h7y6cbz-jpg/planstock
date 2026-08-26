import type { Site } from '../types';

/**
 * Logo du local. Tant qu'aucun fichier n'a été déposé dans `public/logos/`, un
 * pictogramme est dessiné : trois tablettes chargées, dans la couleur du local.
 * Aucune image externe n'est chargée — l'application doit fonctionner réseau
 * débranché.
 */

interface LogoProps {
  site?: Site | null;
  size?: number;
  /** Le logo est décoratif quand le nom du local est écrit juste à côté. */
  title?: string;
}

export function Logo({ site, size = 40, title }: LogoProps) {
  if (site?.logo) {
    return (
      <img
        src={`/logos/${site.logo}`}
        alt={title ?? site.name}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    );
  }

  const accent = site?.accent ?? 'var(--accent)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block' }}
    >
      {/* Montants */}
      <rect x="5" y="5" width="4" height="38" rx="2" fill={accent} />
      <rect x="39" y="5" width="4" height="38" rx="2" fill={accent} />
      {/* Tablettes */}
      <rect x="5" y="20" width="38" height="3.4" rx="1.7" fill={accent} />
      <rect x="5" y="33" width="38" height="3.4" rx="1.7" fill={accent} />
      <rect x="5" y="39.6" width="38" height="3.4" rx="1.7" fill={accent} />
      {/* Cartons posés */}
      <rect x="11" y="10" width="10" height="10" rx="2" fill={accent} opacity="0.45" />
      <rect x="23" y="13" width="8" height="7" rx="2" fill={accent} opacity="0.3" />
      <rect x="11" y="25" width="8" height="8" rx="2" fill={accent} opacity="0.3" />
      <rect x="21" y="24" width="12" height="9" rx="2" fill={accent} opacity="0.45" />
    </svg>
  );
}
