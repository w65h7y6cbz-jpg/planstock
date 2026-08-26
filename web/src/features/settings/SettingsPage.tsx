import type { ReactNode } from 'react';
import styles from './SettingsPage.module.css';

/**
 * Coquille des écrans de réglage : ils prennent la page entière plutôt qu'une
 * fenêtre, pour que les champs restent grands et qu'on n'ait rien à faire
 * défiler dans une boîte trop petite.
 */

interface SettingsPageProps {
  title: string;
  subtitle?: string;
  /** Actions posées à droite du titre (bouton d'ajout, export…). */
  actions?: ReactNode;
  onBack: () => void;
  children: ReactNode;
}

export function SettingsPage({ title, subtitle, actions, onBack, children }: SettingsPageProps) {
  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← Retour
        </button>
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      <div className={styles.body}>{children}</div>
    </main>
  );
}
