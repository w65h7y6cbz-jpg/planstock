import { useState } from 'react';
import type { RackPayload } from '../../api';
import { TopView, type Geometry } from '../../components/TopView';
import type { Rack } from '../../types';
import styles from './PlanEditor.module.css';

interface PlanEditorProps {
  racks: Rack[];
  error: string | null;
  /** Aucune modification tant qu'aucun prénom n'est sélectionné. */
  canEdit: boolean;
  planWidth?: number;
  planHeight?: number;
  onCreate: (payload: RackPayload) => Promise<void>;
  onUpdate: (id: number, payload: RackPayload) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const DEFAULT_SHELVES = 4;
const DEFAULT_SLOTS = 5;

export function PlanEditor({
  racks,
  error,
  canEdit,
  planWidth = 100,
  planHeight = 100,
  onCreate,
  onUpdate,
  onDelete,
}: PlanEditorProps) {
  const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [shelves, setShelves] = useState(String(DEFAULT_SHELVES));
  const [slots, setSlots] = useState(String(DEFAULT_SLOTS));
  const [busy, setBusy] = useState(false);

  async function submitNewRack(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    await onCreate({
      label: label.trim(),
      shelves_count: Number(shelves) || DEFAULT_SHELVES,
      slots_per_shelf: Number(slots) || DEFAULT_SLOTS,
    });
    setLabel('');
    setBusy(false);
  }

  async function confirmDelete(rack: Rack) {
    if (!canEdit) return;
    const message =
      rack.items_count > 0
        ? `${rack.rack_code} contient ${rack.items_count} article(s). La suppression sera refusée tant qu’ils n’auront pas été déplacés. Continuer ?`
        : `Supprimer le rayonnage ${rack.rack_code} et ses ${rack.slots_total} cases ?`;
    if (window.confirm(message)) await onDelete(rack.id);
  }

  function commitGeometry(rackId: number, geometry: Geometry) {
    if (!canEdit) return;
    void onUpdate(rackId, geometry);
  }

  return (
    <div className={styles.editor}>
      <div className={styles.side}>
        {!canEdit ? (
          <p className={styles.warning}>
            Sélectionnez votre prénom en haut de l’écran pour modifier le plan.
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <h3 className={styles.sectionTitle}>Rayonnages ({racks.length})</h3>

        {racks.length === 0 ? (
          <p className={styles.empty}>
            Aucun rayonnage. Créez le premier ci-dessous : ses cases seront générées
            automatiquement.
          </p>
        ) : (
          <ul className={styles.list}>
            {racks.map((rack) => (
              <li
                key={rack.id}
                className={`${styles.row} ${
                  selectedRackId === rack.id ? styles.rowSelected : ''
                }`}
                onPointerDown={() => setSelectedRackId(rack.id)}
              >
                <span className={styles.code}>{rack.rack_code}</span>

                <input
                  className={styles.labelInput}
                  type="text"
                  defaultValue={rack.label}
                  placeholder="Libellé (ex. Rayon imprimantes)"
                  disabled={!canEdit}
                  aria-label={`Libellé du rayonnage ${rack.rack_code}`}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== rack.label) void onUpdate(rack.id, { label: next });
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />

                <span className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={!canEdit}
                    title={rack.rotation === 90 ? 'Remettre à l’horizontale' : 'Pivoter à 90°'}
                    aria-label={`Pivoter le rayonnage ${rack.rack_code}`}
                    onClick={() =>
                      void onUpdate(rack.id, { rotation: rack.rotation === 90 ? 0 : 90 })
                    }
                  >
                    ⟳
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    disabled={!canEdit}
                    title="Supprimer ce rayonnage"
                    aria-label={`Supprimer le rayonnage ${rack.rack_code}`}
                    onClick={() => void confirmDelete(rack)}
                  >
                    ✕
                  </button>
                </span>

                <div className={styles.dimensions}>
                  <label className={styles.dimension}>
                    Étagères
                    <input
                      className={styles.number}
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={rack.shelves_count}
                      disabled={!canEdit}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (next && next !== rack.shelves_count) {
                          void onUpdate(rack.id, { shelves_count: next });
                        }
                      }}
                    />
                  </label>
                  <label className={styles.dimension}>
                    Cases
                    <input
                      className={styles.number}
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={rack.slots_per_shelf}
                      disabled={!canEdit}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (next && next !== rack.slots_per_shelf) {
                          void onUpdate(rack.id, { slots_per_shelf: next });
                        }
                      }}
                    />
                  </label>
                  <span className={styles.total}>
                    {rack.slots_total} cases · {rack.items_count} article(s)
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className={styles.form} onSubmit={submitNewRack}>
          <h3 className={styles.sectionTitle}>Ajouter un rayonnage</h3>
          <label className={styles.field}>
            Libellé
            <input
              type="text"
              value={label}
              placeholder="Rayon imprimantes"
              disabled={!canEdit}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Étagères
              <input
                type="number"
                min={1}
                max={20}
                value={shelves}
                disabled={!canEdit}
                onChange={(event) => setShelves(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              Cases par étagère
              <input
                type="number"
                min={1}
                max={20}
                value={slots}
                disabled={!canEdit}
                onChange={(event) => setSlots(event.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={!canEdit || busy}
          >
            Ajouter le rayonnage
          </button>
        </form>
      </div>

      <div className={styles.planSide}>
        <p className={styles.hint}>
          Glissez un rectangle pour le placer, la poignée bleue en bas à droite pour le
          redimensionner. Au clavier : Tab pour sélectionner, flèches pour déplacer (Maj = pas
          de 5 %).
        </p>
        <TopView
          racks={racks}
          planWidth={planWidth}
          planHeight={planHeight}
          selectedRackId={selectedRackId}
          editable={canEdit}
          onSelectRack={(rack) => setSelectedRackId(rack.id)}
          onGeometryCommit={commitGeometry}
        />
      </div>
    </div>
  );
}
