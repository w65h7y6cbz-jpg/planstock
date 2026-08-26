import type { PickEntry } from '../lib/picklist';
import type { Location } from '../types';
import styles from './PickList.module.css';

interface PickListProps {
  physical: PickEntry[];
  withoutStock: PickEntry[];
  pending: number;
  flashedItemId: number | null;
  onToggle: (itemId: number) => void;
  onRemove: (itemId: number) => void;
  onCheckAll: () => void;
  onClear: () => void;
  /** Ouvre la vue de face sur l'emplacement de la ligne. */
  onShowLocation: (location: Location) => void;
}

const KIND_BADGE: Record<string, string> = {
  service: 'Service',
  other_site: 'Autre site',
};

export function PickList({
  physical,
  withoutStock,
  pending,
  flashedItemId,
  onToggle,
  onRemove,
  onCheckAll,
  onClear,
  onShowLocation,
}: PickListProps) {
  const total = physical.length + withoutStock.length;

  function confirmClear() {
    if (pending > 0) {
      const message =
        pending === 1
          ? 'Un article physique n’est pas encore coché. Vider quand même la liste ?'
          : `${pending} articles physiques ne sont pas encore cochés. Vider quand même la liste ?`;
      if (!window.confirm(message)) return;
    }
    onClear();
  }

  if (total === 0) {
    return (
      <div className={styles.empty}>
        <span>Aucune référence pour l’instant.</span>
        <span>Tapez une référence du bon de préparation, puis Entrée.</span>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <div className={styles.actions}>
        <span className={styles.count}>
          {physical.length} à préparer · {pending} restant(s)
        </span>
        <button
          type="button"
          className={styles.button}
          onClick={onCheckAll}
          disabled={pending === 0}
        >
          Tout cocher
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonDanger}`}
          onClick={confirmClear}
        >
          Vider
        </button>
      </div>

      <ul className={styles.rows}>
        {physical.map((entry) => {
          const location = entry.item.locations[0];
          const extra = entry.item.locations.length - 1;

          return (
            <li
              key={entry.item.id}
              className={`${styles.row} ${entry.checked ? styles.rowChecked : ''} ${
                flashedItemId === entry.item.id ? styles.rowFlash : ''
              }`}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={entry.checked}
                aria-label={`Marquer ${entry.item.reference_display} comme prélevé`}
                onChange={() => onToggle(entry.item.id)}
              />

              <span className={styles.labels}>
                <span className={styles.reference}>{entry.item.reference_display}</span>
                <span className={styles.designation} title={entry.item.designation}>
                  {entry.item.designation || '—'}
                </span>
              </span>

              {location ? (
                <button
                  type="button"
                  className={`${styles.location} ${entry.checked ? styles.locationChecked : ''}`}
                  title={`Voir ${location.code} sur le plan`}
                  onClick={() => onShowLocation(location)}
                >
                  {location.code}
                  {extra > 0 ? ` +${extra}` : ''}
                </button>
              ) : (
                <span
                  className={`${styles.location} ${styles.locationMissing}`}
                  title="Article physique sans emplacement enregistré"
                >
                  à placer
                </span>
              )}

              <button
                type="button"
                className={styles.remove}
                aria-label={`Retirer ${entry.item.reference_display} de la liste`}
                onClick={() => onRemove(entry.item.id)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {withoutStock.length > 0 ? (
        <details className={styles.section}>
          <summary className={styles.sectionSummary}>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
            Sans stock physique ({withoutStock.length})
          </summary>
          <ul className={styles.sectionRows}>
            {withoutStock.map((entry) => (
              <li
                key={entry.item.id}
                className={`${styles.row} ${styles.rowChecked} ${
                  flashedItemId === entry.item.id ? styles.rowFlash : ''
                }`}
              >
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={entry.checked}
                  aria-label={`${entry.item.reference_display} — sans stock physique`}
                  onChange={() => onToggle(entry.item.id)}
                />
                <span className={styles.labels}>
                  <span className={styles.reference}>{entry.item.reference_display}</span>
                  <span className={styles.designation} title={entry.item.designation}>
                    {entry.item.designation || '—'}
                  </span>
                </span>
                <span className={styles.badge}>{KIND_BADGE[entry.item.kind] ?? entry.item.kind}</span>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Retirer ${entry.item.reference_display} de la liste`}
                  onClick={() => onRemove(entry.item.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
