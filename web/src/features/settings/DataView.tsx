import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type BackupFile } from '../../api';
import type { Site, User } from '../../types';
import styles from './settings.module.css';

/**
 * Sauvegardes, restauration et exports.
 *
 * Il n'y a plus de fichiers sur un PC : la base vit chez Cloudflare. Trois
 * filets remplacent les copies datées d'autrefois — l'historique automatique de
 * D1 sur trente jours, le fichier à télécharger avant une manipulation risquée,
 * et sa restauration.
 */

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

const TABLE_LABELS: Record<string, string> = {
  sites: 'locaux',
  users: 'prénoms',
  racks: 'rayonnages et zones',
  shelves: 'étagères',
  landmarks: 'repères',
  items: 'articles',
  item_locations: 'emplacements',
  movements: 'mouvements',
  settings: 'réglages',
};

export function DataView({ site, currentUser, onDataReplaced, onRelaunchInventory }: DataViewProps) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const [backups, demo] = await Promise.all([api.backups.counts(), api.demo.status()]);
      setCounts(backups.counts);
      setDemoAvailable(demo.available);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de lire l’état de la base.'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function requireUser(): number | null {
    if (currentUser) return currentUser.id;
    setError('Choisis ton prénom en haut à droite avant de modifier les données.');
    return null;
  }

  /** Le fichier Excel est assemblé ici, dans le navigateur. */
  async function downloadExcel() {
    setBusy(true);
    setError(null);
    try {
      const { headers, rows } = await api.exportRows(site.id);
      // Chargée à la demande : la bibliothèque pèse lourd, elle n'a pas à
      // ralentir l'ouverture de l'application.
      const ExcelJS = (await import('exceljs')).default;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PlanStock';
      const sheet = workbook.addWorksheet('Articles');
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
      for (const row of rows) sheet.addRow(row);
      sheet.columns = [18, 46, 10, 34, 16, 16, 16, 10].map((width) => ({ width }));
      sheet.autoFilter = { from: 'A1', to: 'H1' };

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `planstock-${site.code}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(messageOf(cause, 'Export Excel impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromFile(file: File) {
    const userId = requireUser();
    if (userId === null) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const backup = JSON.parse(await file.text()) as BackupFile;
      if (
        !window.confirm(
          `Remplacer tout le contenu actuel par la sauvegarde du ${new Date(
            backup.exported_at,
          ).toLocaleString('fr-FR')} ? Ce qui est en base aujourd’hui sera perdu.`,
        )
      ) {
        return;
      }

      const result = await api.backups.restore(userId, backup);
      setNotice(
        `Sauvegarde restaurée : ${result.counts.items} articles, ${result.counts.racks} emplacements.`,
      );
      await reload();
      await onDataReplaced();
    } catch (cause) {
      setError(messageOf(cause, 'Restauration impossible : fichier illisible.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function seedDemo() {
    const userId = requireUser();
    if (userId === null || busy) return;
    setBusy(true);
    try {
      const result = await api.demo.seed(userId);
      setNotice(
        `Jeu de démonstration installé : ${result.racks} rayonnages, ${result.zones} zones et ${result.items} articles.`,
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
        <h3 className={styles.sectionTitle}>Export du stock</h3>
        <p className={styles.hint}>
          Les articles de {site.name} avec leur désignation, leur famille, leur type, leur
          emplacement et leur côté. Le CSV s’ouvre directement dans Excel (séparateur « ; »).
        </p>
        <div className={styles.buttons}>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={busy}
            onClick={() => void downloadExcel()}
          >
            {busy ? 'Préparation…' : 'Export Excel (.xlsx)'}
          </button>
          <a className={styles.button} href={api.exportCsvUrl(site.id)} download>
            Export CSV
          </a>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Sauvegardes</h3>
        <p className={styles.hint}>
          Cloudflare conserve tout seul <strong>trente jours d’historique</strong> de la base : on
          peut revenir à n’importe quel instant sans avoir rien préparé. Le fichier ci-dessous
          s’ajoute à ce filet, pour les manipulations risquées.
        </p>

        {counts ? (
          <p className={styles.hint}>
            Contenu actuel :{' '}
            {Object.entries(counts)
              .filter(([, total]) => total > 0)
              .map(([table, total]) => `${total} ${TABLE_LABELS[table] ?? table}`)
              .join(' · ')}
          </p>
        ) : null}

        <div className={styles.buttons}>
          <a
            className={`${styles.button} ${styles.primary}`}
            href={api.backups.exportUrl()}
            download
          >
            Télécharger une sauvegarde
          </a>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={busy || !currentUser}
            onClick={() => fileRef.current?.click()}
          >
            Restaurer depuis un fichier…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restoreFromFile(file);
            }}
          />
        </div>
        <p className={styles.warning}>
          Restaurer remplace <strong>tout</strong> le contenu, les deux locaux compris. Si c’est une
          erreur, l’historique de Cloudflare permet de revenir en arrière.
        </p>
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
          Le jeu de démonstration remplit les deux locaux d’un stock fictif pour prendre l’outil en
          main. Il ne s’installe que sur une base sans rayonnage ni article, pour ne jamais écraser
          de vraies données.
        </p>
      </section>
    </div>
  );
}
