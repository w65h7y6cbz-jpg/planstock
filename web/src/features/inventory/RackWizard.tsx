import { useState } from 'react';
import type { RackPayload } from '../../api';
import { layoutRacks } from '../../lib/planLayout';
import styles from './InventoryMode.module.css';

const DEFAULT_RACKS = 4;
const DEFAULT_ZONES = 2;
const DEFAULT_SHELVES = 5;
const MAX_ITEMS = 40;

interface RackDraft {
  label: string;
  aisle: string;
  shelves: number;
}

interface ZoneDraft {
  label: string;
}

interface RackWizardProps {
  onCreate: (racks: RackPayload[]) => Promise<void>;
  onSkip: () => void;
  error: string | null;
}

const makeRacks = (count: number): RackDraft[] =>
  Array.from({ length: count }, () => ({ label: '', aisle: '', shelves: DEFAULT_SHELVES }));

const makeZones = (count: number): ZoneDraft[] => Array.from({ length: count }, () => ({ label: '' }));

export function RackWizard({ onCreate, onSkip, error }: RackWizardProps) {
  const [rackCount, setRackCount] = useState(DEFAULT_RACKS);
  const [zoneCount, setZoneCount] = useState(DEFAULT_ZONES);
  const [racks, setRacks] = useState<RackDraft[]>(() => makeRacks(DEFAULT_RACKS));
  const [zones, setZones] = useState<ZoneDraft[]>(() => makeZones(DEFAULT_ZONES));
  const [busy, setBusy] = useState(false);

  function resizeRacks(next: number) {
    const clamped = Math.min(Math.max(next || 0, 0), MAX_ITEMS);
    setRackCount(clamped);
    setRacks((current) =>
      clamped <= current.length
        ? current.slice(0, clamped)
        : [...current, ...makeRacks(clamped - current.length)],
    );
  }

  function resizeZones(next: number) {
    const clamped = Math.min(Math.max(next || 0, 0), MAX_ITEMS);
    setZoneCount(clamped);
    setZones((current) =>
      clamped <= current.length
        ? current.slice(0, clamped)
        : [...current, ...makeZones(clamped - current.length)],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || racks.length + zones.length === 0) return;
    setBusy(true);

    const geometries = layoutRacks(racks.length + zones.length);
    const payloads: RackPayload[] = [
      ...racks.map((draft, index) => ({
        kind: 'rack' as const,
        code: index + 1,
        label: draft.label.trim(),
        aisle: draft.aisle.trim(),
        shelves_count: draft.shelves,
        ...geometries[index],
      })),
      ...zones.map((draft, index) => ({
        kind: 'zone' as const,
        code: index + 1,
        label: draft.label.trim(),
        shelves_count: 0,
        ...geometries[racks.length + index],
      })),
    ];

    await onCreate(payloads);
    setBusy(false);
  }

  const totalShelves = racks.reduce((total, draft) => total + draft.shelves, 0);

  return (
    <div className={styles.wizard}>
      <form className={styles.wizardCard} onSubmit={submit}>
        <h2 className={styles.wizardTitle}>Dessinons d’abord le plan du local</h2>
        <p className={styles.wizardLead}>
          Combien de rayonnages, et combien d’étagères chacun ? Ajoutez aussi les zones sans
          étagère : piles au sol, palettes, cage grillagée, table, présentoir. Les rectangles
          seront placés automatiquement sur la vue de dessus, vous les déplacerez ensuite à leur
          vraie position.
        </p>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.wizardCount}>
          <label className={styles.field}>
            Nombre de rayonnages
            <input
              type="number"
              min={0}
              max={MAX_ITEMS}
              value={rackCount}
              autoFocus
              onChange={(event) => resizeRacks(Number(event.target.value))}
            />
          </label>
          <label className={styles.field}>
            Nombre de zones
            <input
              type="number"
              min={0}
              max={MAX_ITEMS}
              value={zoneCount}
              onChange={(event) => resizeZones(Number(event.target.value))}
            />
          </label>
          <p className={styles.wizardSummary}>
            {racks.length} rayonnage(s) · {totalShelves} étagères · {zones.length} zone(s)
          </p>
        </div>

        <ul className={styles.rackRows}>
          {racks.map((draft, index) => (
            <li key={`rack-${index}`} className={styles.rackRow}>
              <span className={styles.rackCode}>R{String(index + 1).padStart(2, '0')}</span>
              <input
                type="text"
                value={draft.label}
                placeholder="Libellé (facultatif) — ex. Rayon imprimantes"
                aria-label={`Libellé du rayonnage ${index + 1}`}
                onChange={(event) =>
                  setRacks((current) =>
                    current.map((row, position) =>
                      position === index ? { ...row, label: event.target.value } : row,
                    ),
                  )
                }
              />
              <label>
                Allée
                <input
                  type="text"
                  value={draft.aisle}
                  placeholder="A"
                  aria-label={`Allée du rayonnage ${index + 1}`}
                  onChange={(event) =>
                    setRacks((current) =>
                      current.map((row, position) =>
                        position === index ? { ...row, aisle: event.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Étagères
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.shelves}
                  aria-label={`Étagères du rayonnage ${index + 1}`}
                  onChange={(event) =>
                    setRacks((current) =>
                      current.map((row, position) =>
                        position === index
                          ? { ...row, shelves: Number(event.target.value) || 1 }
                          : row,
                      ),
                    )
                  }
                />
              </label>
            </li>
          ))}

          {zones.map((draft, index) => (
            <li key={`zone-${index}`} className={`${styles.rackRow} ${styles.zoneRow}`}>
              <span className={styles.rackCode}>Z{String(index + 1).padStart(2, '0')}</span>
              <input
                type="text"
                value={draft.label}
                placeholder="Libellé (facultatif) — ex. Pile ProDesk, Palette réception"
                aria-label={`Libellé de la zone ${index + 1}`}
                onChange={(event) =>
                  setZones((current) =>
                    current.map((row, position) =>
                      position === index ? { label: event.target.value } : row,
                    ),
                  )
                }
              />
              <span className={styles.zoneNote}>zone — pas d’étagère</span>
            </li>
          ))}
        </ul>

        <div className={styles.wizardActions}>
          <button type="button" className={styles.button} onClick={onSkip} disabled={busy}>
            Plus tard
          </button>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={busy || racks.length + zones.length === 0}
          >
            {busy ? 'Création…' : 'Créer le plan'}
          </button>
        </div>
      </form>
    </div>
  );
}
