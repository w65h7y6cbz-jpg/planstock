import { KIND_LABELS } from '../lib/labels';
import type { PickEntry } from '../lib/picklist';
import type { PickListState } from '../hooks/usePickList';
import styles from './PickDrawer.module.css';

/**
 * Liste de préparation, en tiroir à droite.
 *
 * Elle s'ouvre au premier ajout et garde l'ordre de saisie — l'ordre du bon
 * papier, ligne par ligne. Un article coché reste à sa place, barré : on voit
 * d'un coup ce qui est fait et ce qui reste, sans que la liste se réorganise
 * sous les yeux.
 */

interface PickDrawerProps {
  open: boolean;
  pickList: PickListState;
  onClose: () => void;
  onShow: (entry: PickEntry) => void;
}

export function PickDrawer({ open, pickList, onClose, onShow }: PickDrawerProps) {
  const { entries, pending, complete, npl, setNpl } = pickList;
  const done = entries.length - pending;

  return (
    <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-hidden={!open}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>Préparation</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer la liste">
            ×
          </button>
        </div>

        <label className={styles.nplField}>
          <span className={styles.nplLabel}>N° du bon</span>
          <input
            className={styles.nplInput}
            value={npl}
            onChange={(event) => setNpl(event.target.value.toUpperCase())}
            placeholder="NPL12345"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        {entries.length > 0 ? (
          <p className={styles.counter}>
            <span className={styles.counterDone}>{done}</span> sur {entries.length} pris
          </p>
        ) : null}
      </div>

      {complete ? (
        <p className={styles.finished}>
          <strong>Préparation terminée.</strong> Les {entries.length} lignes sont prises.
        </p>
      ) : null}

      <div className={styles.list}>
        {entries.length === 0 ? (
          <p className={styles.empty}>
            La liste est vide. Tape une référence : elle s’ajoute ici toute seule.
          </p>
        ) : (
          entries.map((entry) => (
            <Line
              key={entry.item.id}
              entry={entry}
              flashed={pickList.flashedItemId === entry.item.id}
              onToggle={() => pickList.toggle(entry.item.id)}
              onShow={() => onShow(entry)}
              onRemove={() => pickList.remove(entry.item.id)}
            />
          ))
        )}
      </div>

      {entries.length > 0 ? (
        <div className={styles.footer}>
          <button type="button" className={styles.clear} onClick={pickList.clear}>
            Vider la liste
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function Line({
  entry,
  flashed,
  onToggle,
  onShow,
  onRemove,
}: {
  entry: PickEntry;
  flashed: boolean;
  onToggle: () => void;
  onShow: () => void;
  onRemove: () => void;
}) {
  const location = entry.item.locations[0] ?? null;
  const physical = entry.item.kind === 'physical';

  return (
    <div
      className={[
        styles.line,
        entry.checked ? styles.lineChecked : '',
        flashed ? styles.lineFlash : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={styles.check}
        onClick={onToggle}
        aria-pressed={entry.checked}
        aria-label={entry.checked ? 'Remettre à prendre' : 'Marquer comme pris'}
      >
        {entry.checked ? '✓' : ''}
      </button>

      <button type="button" className={styles.lineBody} onClick={onShow}>
        <span className={styles.lineRef}>{entry.item.reference_display}</span>
        {entry.item.designation ? (
          <span className={styles.lineLabel}>{entry.item.designation}</span>
        ) : null}
      </button>

      <span className={styles.lineCode}>
        {physical ? (location?.code ?? '—') : KIND_LABELS[entry.item.kind]}
      </span>

      <button
        type="button"
        className={styles.remove}
        onClick={onRemove}
        aria-label={`Retirer ${entry.item.reference_display} de la liste`}
      >
        ×
      </button>
    </div>
  );
}
