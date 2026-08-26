import type { CSSProperties } from 'react';
import type { Site } from '../types';
import { Logo } from './Logo';
import styles from './SiteChooser.module.css';

/**
 * Premier écran : sur quel local travaille-t-on ?
 * Le choix est mémorisé, cet écran ne réapparaît qu'à la demande (bouton
 * « Changer de local » dans le menu). Chaque local porte sa couleur : elle
 * devient celle de toute l'application une fois entré.
 */

interface SiteChooserProps {
  sites: Site[];
  loading: boolean;
  error: string | null;
  onSelect: (siteId: number) => void;
}

function summary(site: Site): string {
  if (site.racks_count === 0 && site.zones_count === 0) return 'Local vide, à inventorier';

  const parts = [];
  if (site.racks_count > 0) parts.push(`${site.racks_count} rayonnage${site.racks_count > 1 ? 's' : ''}`);
  if (site.zones_count > 0) parts.push(`${site.zones_count} zone${site.zones_count > 1 ? 's' : ''}`);
  parts.push(`${site.items_count} article${site.items_count > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export function SiteChooser({ sites, loading, error, onSelect }: SiteChooserProps) {
  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>Quel local ?</h1>
      <p className={styles.subtitle}>Ce choix est mémorisé sur ce poste.</p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.loading}>Chargement des locaux…</p> : null}

      <div className={styles.choices}>
        {sites.map((site) => (
          <button
            key={site.id}
            type="button"
            className={styles.choice}
            style={{ '--site-accent': site.accent } as CSSProperties}
            onClick={() => onSelect(site.id)}
          >
            <span className={styles.mark}>
              <Logo site={site} size={72} />
            </span>
            <span className={styles.name}>{site.name}</span>
            <span className={styles.summary}>{summary(site)}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
