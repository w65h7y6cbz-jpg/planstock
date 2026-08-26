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
  onPlanShapeChange: (height: number) => Promise<void>;
}

const DEFAULT_SHELVES = 5;

/** Proportions du local : la largeur reste la référence, la hauteur varie. */
const SHAPES = [
  { value: 100, label: 'Carré' },
  { value: 75, label: 'Large' },
  { value: 55, label: 'Très large' },
  { value: 40, label: 'Tout en longueur' },
];

export function PlanEditor({
  racks,
  error,
  canEdit,
  planWidth = 100,
  planHeight = 100,
  onCreate,
  onUpdate,
  onDelete,
  onPlanShapeChange,
}: PlanEditorProps) {
  const [selectedRackId, setSelectedRackId] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [aisle, setAisle] = useState('');
  const [shelves, setShelves] = useState(String(DEFAULT_SHELVES));
  const [busy, setBusy] = useState(false);

  async function submitNew(kind: 'rack' | 'zone') {
    if (!canEdit || busy) return;
    setBusy(true);
    await onCreate({
      kind,
      label: label.trim(),
      aisle: kind === 'rack' ? aisle.trim() : '',
      shelves_count: kind === 'rack' ? Number(shelves) || DEFAULT_SHELVES : 0,
    });
    setLabel('');
    setAisle('');
    setBusy(false);
  }

  async function confirmDelete(rack: Rack) {
    if (!canEdit) return;
    const what = rack.is_zone ? 'la zone' : 'le rayonnage';
    const message =
      rack.items_count > 0
        ? `${rack.rack_code} contient ${rack.items_count} article(s). La suppression sera refusée tant qu’ils n’auront pas été déplacés. Continuer ?`
        : `Supprimer ${what} ${rack.rack_code}${
            rack.is_zone ? '' : ` et ses ${rack.shelves_count} étagères`
          } ?`;
    if (window.confirm(message)) await onDelete(rack.id);
  }

  function commitGeometry(rackId: number, geometry: Geometry) {
    if (!canEdit) return;
    void onUpdate(rackId, geometry);
  }

  const zones = racks.filter((rack) => rack.is_zone).length;

  return (
    <div className={styles.editor}>
      <div className={styles.side}>
        {!canEdit ? (
          <p className={styles.warning}>
            Sélectionnez votre prénom en haut de l’écran pour modifier le plan.
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <h3 className={styles.sectionTitle}>
          Emplacements ({racks.length - zones} rayonnage(s), {zones} zone(s))
        </h3>

        {racks.length === 0 ? (
          <p className={styles.empty}>
            Aucun emplacement. Créez le premier ci-dessous : les étagères d’un rayonnage sont
            générées automatiquement.
          </p>
        ) : (
          <ul className={styles.list}>
            {racks.map((rack) => (
              <li
                key={rack.id}
                className={`${styles.row} ${selectedRackId === rack.id ? styles.rowSelected : ''} ${
                  rack.is_zone ? styles.rowZone : ''
                }`}
                onPointerDown={() => setSelectedRackId(rack.id)}
              >
                <span className={styles.code}>{rack.rack_code}</span>

                <input
                  className={styles.labelInput}
                  type="text"
                  defaultValue={rack.label}
                  placeholder={rack.is_zone ? 'Libellé (ex. Pile ProDesk)' : 'Libellé (ex. Rayon imprimantes)'}
                  disabled={!canEdit}
                  aria-label={`Libellé de ${rack.rack_code}`}
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
                    aria-label={`Pivoter ${rack.rack_code}`}
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
                    title="Supprimer cet emplacement"
                    aria-label={`Supprimer ${rack.rack_code}`}
                    onClick={() => void confirmDelete(rack)}
                  >
                    ✕
                  </button>
                </span>

                <div className={styles.dimensions}>
                  {rack.is_zone ? (
                    <span className={styles.zoneNote}>zone — pas d’étagère</span>
                  ) : (
                    <>
                      <label className={styles.dimension}>
                        Étagères
                        <input
                          className={styles.number}
                          type="number"
                          min={1}
                          max={30}
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
                        Allée
                        <input
                          className={styles.aisleInput}
                          type="text"
                          defaultValue={rack.aisle}
                          placeholder="Allée A"
                          disabled={!canEdit}
                          aria-label={`Allée de ${rack.rack_code}`}
                          onBlur={(event) => {
                            const next = event.target.value.trim();
                            if (next !== rack.aisle) void onUpdate(rack.id, { aisle: next });
                          }}
                          onKeyDown={(event) =>
                            event.key === 'Enter' && event.currentTarget.blur()
                          }
                        />
                      </label>
                    </>
                  )}
                  <span className={styles.total}>{rack.items_count} article(s)</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.form}>
          <h3 className={styles.sectionTitle}>Ajouter un emplacement</h3>
          <label className={styles.field}>
            Libellé
            <input
              type="text"
              value={label}
              placeholder="Rayon imprimantes / Pile ProDesk"
              disabled={!canEdit}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <div className={styles.formRow}>
            <label className={styles.field}>
              Étagères (rayonnage)
              <input
                type="number"
                min={1}
                max={30}
                value={shelves}
                disabled={!canEdit}
                onChange={(event) => setShelves(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              Allée (facultatif)
              <input
                type="text"
                value={aisle}
                placeholder="Allée A"
                disabled={!canEdit}
                onChange={(event) => setAisle(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.formRow}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={!canEdit || busy}
              onClick={() => void submitNew('rack')}
            >
              Ajouter un rayonnage
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={!canEdit || busy}
              onClick={() => void submitNew('zone')}
            >
              Ajouter une zone
            </button>
          </div>
          <p className={styles.hint}>
            Une zone (pile au sol, palette, cage, table, présentoir) n’a pas d’étagère : les
            articles y sont posés directement.
          </p>
        </div>
      </div>

      <div className={styles.planSide}>
        <div className={styles.planHeader}>
          <label className={styles.field}>
            Proportions du local
            <select
              value={planHeight}
              disabled={!canEdit || busy}
              onChange={(event) => void onPlanShapeChange(Number(event.target.value))}
            >
              {SHAPES.map((shape) => (
                <option key={shape.value} value={shape.value}>
                  {shape.label}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>
            Glissez un rectangle pour le placer — les bords se collent entre eux, pour les
            rayonnages dos à dos. Poignée bleue pour redimensionner, molette pour zoomer, glisser
            sur le fond pour se déplacer. Au clavier : Tab puis flèches (Maj = pas de 5 %).
          </p>
        </div>
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
