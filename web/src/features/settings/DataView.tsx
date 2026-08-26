import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api';
import type { Backup, Site, User } from '../../types';
import styles from './settings.module.css';

interface DataViewProps {
  /** L'export se limite au local ouvert. */
  site: Site;
  currentUser: User | null;
  /** Rechargement complet après restauration ou installation de la démo. */
  onDataReplaced: () => Promise<void>;
  onRelaunchInventory: () => void;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function DataView({ site, currentUser, onDataReplaced, onRelaunchInventory }: DataViewProps) {
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [list, demo] = await Promise.all([api.backups.list(), api.demo.status()]);
      setBackups(list);
      setDemoAvailable(demo.available);
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de lire les sauvegardes.'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function requireUser(): number | null {
    if (currentUser) return currentUser.id;
    setError('Sélectionnez d’abord votre prénom en haut à droite.');
    return null;
  }

  async function createBackup() {
    const userId = requireUser();
    if (userId === null || busy) return;
    setBusy(true);
    try {
      const { created } = await api.backups.create(userId);
      setNotice(`Sauvegarde créée : ${created}`);
      setError(null);
      await reload();
    } catch (cause) {
      setError(messageOf(cause, 'Sauvegarde impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function restore(backup: Backup) {
    const userId = requireUser();
    if (userId === null || busy) return;
    if (
      !window.confirm(
        `Restaurer la sauvegarde du ${formatDate(backup.created_at)} ?\n\n` +
          'Tout le contenu actuel (plan, articles, historique) sera remplacé. ' +
          'Une copie de sécurité de l’état actuel est créée automatiquement avant.',
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await api.backups.restore(userId, backup.name);
      setNotice(
        `Sauvegarde ${result.restored} restaurée. État précédent conservé dans ${result.safetyBackup}.`,
      );
      setError(null);
      await reload();
      await onDataReplaced();
    } catch (cause) {
      setError(messageOf(cause, 'Restauration impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function seedDemo() {
    const userId = requireUser();
    if (userId === null || busy) return;
    setBusy(true);
    try {
      const result = await api.demo.seed(userId);
      setNotice(
        `Jeu de démonstration installé : ${result.racks} rayonnages et ${result.items} articles.`,
      );
      setError(null);
      await reload();
      await onDataReplaced();
    } catch (cause) {
      setError(messageOf(cause, 'Installation impossible.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.view}>
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? <p className={styles.success}>{notice}</p> : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Export</h3>
        <p className={styles.hint}>
          Tous les articles avec leur désignation, leur famille, leur type et leur code
          d’emplacement. Le CSV s’ouvre directement dans Excel (séparateur « ; »).
        </p>
        <div className={styles.buttons}>
          <a
            className={`${styles.button} ${styles.primary}`}
            href={api.exportUrl('xlsx', site.id)}
            download
          >
            Export Excel (.xlsx)
          </a>
          <a className={styles.button} href={api.exportUrl('csv', site.id)} download>
            Export CSV
          </a>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Inventaire et démonstration</h3>
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={onRelaunchInventory}>
            Relancer l’inventaire initial
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={!demoAvailable || busy}
            title={
              demoAvailable
                ? undefined
                : 'Disponible seulement sur une base sans rayonnage ni article.'
            }
            onClick={() => void seedDemo()}
          >
            Installer le jeu de démonstration
          </button>
        </div>
        <p className={styles.hint}>
          Le jeu de démonstration crée 4 rayonnages et une vingtaine d’articles pour prendre l’outil
          en main. Il ne s’installe que sur une base sans rayonnage ni article, pour ne jamais
          écraser de vraies données.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Sauvegardes ({backups?.length ?? 0})</h3>
        <p className={styles.hint}>
          Une copie datée est créée à chaque démarrage dans <code>data/backups/</code>, et celles de
          plus de 30 jours sont supprimées. Restaurer remplace tout le contenu actuel ; l’état
          précédent est d’abord sauvegardé.
        </p>
        <div className={styles.buttons}>
          <button type="button" className={styles.button} disabled={busy} onClick={() => void createBackup()}>
            Créer une sauvegarde maintenant
          </button>
        </div>

        {backups === null ? (
          <p className={styles.empty}>Chargement…</p>
        ) : backups.length === 0 ? (
          <p className={styles.empty}>Aucune sauvegarde pour l’instant.</p>
        ) : (
          <ul className={styles.list}>
            {backups.map((backup) => (
              <li key={backup.name} className={styles.listRow}>
                <span className={`${styles.name} ${styles.mono}`}>{backup.name}</span>
                <span className={styles.meta}>{formatDate(backup.created_at)}</span>
                <span className={styles.meta}>{formatSize(backup.size)}</span>
                <button
                  type="button"
                  className={`${styles.button} ${styles.danger}`}
                  disabled={busy}
                  onClick={() => void restore(backup)}
                >
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
