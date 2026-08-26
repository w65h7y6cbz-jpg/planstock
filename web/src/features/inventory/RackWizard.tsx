import { useState } from 'react';
import type { RackPayload } from '../../api';
import { layoutRacks } from '../../lib/planLayout';
import styles from './InventoryMode.module.css';

const DEFAULT_RACKS = 4;
const DEFAULT_SHELVES = 4;
const DEFAULT_SLOTS = 5;
const MAX_RACKS = 30;

interface RackDraft {
  label: string;
  shelves: number;
  slots: number;
}

interface RackWizardProps {
  onCreate: (racks: RackPayload[]) => Promise<void>;
  onSkip: () => void;
  error: string | null;
}

export function RackWizard({ onCreate, onSkip, error }: RackWizardProps) {
  const [count, setCount] = useState(DEFAULT_RACKS);
  const [drafts, setDrafts] = useState<RackDraft[]>(() =>
    Array.from({ length: DEFAULT_RACKS }, () => ({
      label: '',
      shelves: DEFAULT_SHELVES,
      slots: DEFAULT_SLOTS,
    })),
  );
  const [busy, setBusy] = useState(false);

  function resize(next: number) {
    const clamped = Math.min(Math.max(next || 1, 1), MAX_RACKS);
    setCount(clamped);
    setDrafts((current) => {
      if (clamped <= current.length) return current.slice(0, clamped);
      return [
        ...current,
        ...Array.from({ length: clamped - current.length }, () => ({
          label: '',
          shelves: DEFAULT_SHELVES,
          slots: DEFAULT_SLOTS,
        })),
      ];
    });
  }

  function patch(index: number, changes: Partial<RackDraft>) {
    setDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...changes } : draft)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const geometries = layoutRacks(drafts.length);
    await onCreate(
      drafts.map((draft, index) => ({
        code: index + 1,
        label: draft.label.trim(),
        shelves_count: draft.shelves,
        slots_per_shelf: draft.slots,
        ...geometries[index],
      })),
    );
    setBusy(false);
  }

  const totalSlots = drafts.reduce((total, draft) => total + draft.shelves * draft.slots, 0);

  return (
    <div className={styles.wizard}>
      <form className={styles.wizardCard} onSubmit={submit}>
        <h2 className={styles.wizardTitle}>Dessinons d’abord le plan du local</h2>
        <p className={styles.wizardLead}>
          Combien de rayonnages y a-t-il dans le local ? Indiquez ensuite, pour chacun, son nombre
          d’étagères et de cases par étagère. Les rectangles seront placés automatiquement sur la
          vue de dessus : vous les déplacerez ensuite à leur vraie position.
        </p>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.wizardCount}>
          <label className={styles.field}>
            Nombre de rayonnages
            <input
              type="number"
              min={1}
              max={MAX_RACKS}
              value={count}
              autoFocus
              onChange={(event) => resize(Number(event.target.value))}
            />
          </label>
          <p className={styles.wizardSummary}>
            {drafts.length} rayonnage(s) · {totalSlots} cases au total
          </p>
        </div>

        <ul className={styles.rackRows}>
          {drafts.map((draft, index) => (
            <li key={index} className={styles.rackRow}>
              <span className={styles.rackCode}>R{String(index + 1).padStart(2, '0')}</span>
              <input
                type="text"
                value={draft.label}
                placeholder="Libellé (facultatif) — ex. Rayon imprimantes"
                aria-label={`Libellé du rayonnage ${index + 1}`}
                onChange={(event) => patch(index, { label: event.target.value })}
              />
              <label>
                Étagères
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.shelves}
                  aria-label={`Étagères du rayonnage ${index + 1}`}
                  onChange={(event) => patch(index, { shelves: Number(event.target.value) || 1 })}
                />
              </label>
              <label>
                Cases
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.slots}
                  aria-label={`Cases du rayonnage ${index + 1}`}
                  onChange={(event) => patch(index, { slots: Number(event.target.value) || 1 })}
                />
              </label>
            </li>
          ))}
        </ul>

        <div className={styles.wizardActions}>
          <button type="button" className={styles.button} onClick={onSkip} disabled={busy}>
            Plus tard
          </button>
          <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>
            {busy ? 'Création…' : 'Créer le plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
