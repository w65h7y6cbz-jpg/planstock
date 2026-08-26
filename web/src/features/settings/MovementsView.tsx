import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Movement } from '../../types';
import styles from './MovementsView.module.css';

const ACTION_LABELS: Record<Movement['action'], string> = {
  create: 'Création',
  move: 'Déplacement',
  update: 'Modification',
  delete: 'Suppression',
};

const ACTION_CLASS: Record<Movement['action'], string> = {
  create: styles.create,
  move: styles.move,
  update: styles.update,
  delete: styles.delete,
};

/** `2026-08-26T01:45:00.000Z` → `26/08/2026 12:45` (heure locale du poste). */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function MovementsView() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void api.movements
        .list(filter || undefined)
        .then((list) => {
          if (cancelled) return;
          setMovements(list);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : 'Historique indisponible.');
          }
        })
        .finally(() => !cancelled && setLoading(false));
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filter]);

  return (
    <div className={styles.view}>
      <div className={styles.filter}>
        <input
          type="search"
          value={filter}
          placeholder="Filtrer par référence…"
          aria-label="Filtrer l’historique par référence"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setFilter(event.target.value)}
        />
        <span className={styles.count}>{movements.length} mouvement(s)</span>
      </div>

      <div className={styles.tableWrapper}>
        {loading ? (
          <p className={styles.empty}>Chargement…</p>
        ) : error ? (
          <p className={styles.empty}>{error}</p>
        ) : movements.length === 0 ? (
          <p className={styles.empty}>
            {filter ? 'Aucun mouvement pour cette référence.' : 'Aucun mouvement enregistré.'}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Technicien</th>
                <th>Action</th>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Emplacement</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className={styles.date}>{formatDate(movement.created_at)}</td>
                  <td>{movement.user_first_name}</td>
                  <td>
                    <span className={`${styles.action} ${ACTION_CLASS[movement.action]}`}>
                      {ACTION_LABELS[movement.action]}
                    </span>
                  </td>
                  <td className={styles.reference}>{movement.item_reference}</td>
                  <td className={styles.designation} title={movement.item_designation}>
                    {movement.item_designation || '—'}
                  </td>
                  <td className={styles.path}>
                    {movement.from_code ?? '—'}
                    <span className={styles.arrow}> → </span>
                    {movement.to_code ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
